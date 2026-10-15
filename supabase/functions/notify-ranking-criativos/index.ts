import { createClient } from "npm:@supabase/supabase-js@2";
import {
  brDate, replaceVars, spDayBounds,
  listActiveOperations, fetchOpTemplate, fetchOpRecipients,
  sendToRecipients, logAutomatedReport, readOnlyOp,
} from "../_shared/notify-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonRes = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fetchAll(sb: any, table: string, select: string, filters: (q: any) => any) {
  const PAGE = 1000;
  let all: any[] = []; let from = 0;
  while (true) {
    let q = sb.from(table).select(select); q = filters(q); q = q.range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) { console.error(`fetchAll ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length || 0) < PAGE) break;
    from += PAGE;
  }
  return all;
}

function normalizeHBId(raw: string): string {
  const m = raw.match(/^(H\d{1,2})(B\d{1,2})(.*)/i);
  if (m) {
    const h = m[1].toUpperCase().replace(/H(\d{1,2})/, (_, d) => `H${d.padStart(2, "0")}`);
    const b = m[2].toUpperCase().replace(/B(\d{1,2})/, (_, d) => `B${d.padStart(2, "0")}`);
    const suffix = m[3] ? m[3].trim().toUpperCase() : "";
    return suffix ? `${h}${b}${suffix.startsWith("-") ? suffix : `-${suffix}`}`.replace(/-$/, "") : `${h}${b}`;
  }
  return raw.toUpperCase();
}
function extractSecondBracketTag(text?: string | null): string | null {
  if (!text) return null;
  const matches = text.match(/\[([^\]]+)\]/g);
  if (!matches || matches.length < 2) return null;
  let raw = matches[1].replace(/^\[|\]$/g, "").trim();
  if (!raw) return null;
  raw = raw.replace(/\s*\[.*$/, "").trim();
  if (!raw) return null;
  return normalizeHBId(raw);
}
function extractCreativeIdFromText(text?: string | null): string | null {
  if (!text) return null;
  const b = text.match(/\[(H\d{1,2}B\d{1,2}[^\]]*)\]/i);
  if (b) { const raw = b[1].trim().replace(/\s*\[.*$/, "").trim(); if (raw) return normalizeHBId(raw); }
  const m = text.match(/\b(H\d{1,2}B\d{1,2}(?:-[A-Z0-9]+(?:-[A-Z0-9]+)*)?)\b/i);
  return m ? normalizeHBId(m[1]) : null;
}
function resolveCreativeId(campaignName?: string | null): string {
  return extractSecondBracketTag(campaignName) ?? "SEM_ID";
}
function resolveCreativeIdWithAd(campaignName?: string | null, adName?: string | null): string {
  const c = resolveCreativeId(campaignName);
  if (c !== "SEM_ID") return c;
  return extractCreativeIdFromText(adName) || "SEM_ID";
}

async function processOperation(sb: any, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "ranking_criativos");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const { startUtc, endUtc } = spDayBounds(today);

  const [cbRows, trafficRows, rtRows] = await Promise.all([
    fetchAll(sb, "clickbank_audit", "receipt, amount_brl, aff_sub2",
      (q: any) => q.eq("date", today).eq("transaction_type", "SALE")
        .gte("amount_usd", 180).lte("amount_usd", 250).eq("operation_id", op.id)),
    fetchAll(sb, "traffic_data", "campaign_name, ad_name, spend",
      (q: any) => q.eq("date", today).eq("operation_id", op.id)),
    fetchAll(sb, "redtrack_events", "amount, currency, utm_campaign",
      (q: any) => q.eq("event_type", "purchase").gt("amount", 0)
        .gte("occurred_at", startUtc).lt("occurred_at", endUtc).eq("operation_id", op.id)),
  ]);

  const campaignIds = [...new Set(cbRows.filter((r: any) => r.aff_sub2).map((r: any) => r.aff_sub2))];
  const campaignMap = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: mcs } = await sb.from("meta_campaign_status")
      .select("campaign_id, campaign_name").in("campaign_id", campaignIds).eq("operation_id", op.id);
    for (const m of (mcs || [])) campaignMap.set(m.campaign_id, m.campaign_name);
  }

  const { data: rateRow } = await sb.from("exchange_rate_log")
    .select("rate").order("created_at", { ascending: false }).limit(1).single();
  const usdToBrl = Number(rateRow?.rate ?? 0) > 0 ? Number(rateRow!.rate) : 5.15;

  const creativeRevenue = new Map<string, number>();
  const seenReceipts = new Set<string>();
  const creativesWithCB = new Set<string>();

  for (const cb of cbRows) {
    if (seenReceipts.has(cb.receipt)) continue;
    const camp = campaignMap.get(cb.aff_sub2 || "");
    if (!camp) continue;
    seenReceipts.add(cb.receipt);
    const cid = resolveCreativeId(camp);
    if (cid === "SEM_ID") continue;
    creativesWithCB.add(cid);
    creativeRevenue.set(cid, (creativeRevenue.get(cid) || 0) + Number(cb.amount_brl || 0));
  }
  for (const r of rtRows) {
    const cid = resolveCreativeId(r.utm_campaign);
    if (cid === "SEM_ID" || creativesWithCB.has(cid)) continue;
    const amt = r.currency === "BRL" ? (r.amount || 0) : (r.amount || 0) * usdToBrl;
    creativeRevenue.set(cid, (creativeRevenue.get(cid) || 0) + amt);
  }

  const creativeSpend = new Map<string, number>();
  for (const t of trafficRows) {
    const cid = resolveCreativeIdWithAd(t.campaign_name, t.ad_name);
    if (cid === "SEM_ID") continue;
    creativeSpend.set(cid, (creativeSpend.get(cid) || 0) + (t.spend || 0));
  }

  const all = new Set([...creativeRevenue.keys(), ...creativeSpend.keys()]);
  const ranked: { name: string; revenue: number; spend: number; profit: number }[] = [];
  for (const k of all) {
    const rv = creativeRevenue.get(k) || 0, sp = creativeSpend.get(k) || 0;
    if (rv < 1 && sp < 1) continue;
    ranked.push({ name: k, revenue: rv, spend: sp, profit: rv - sp });
  }
  ranked.sort((a, b) => b.profit - a.profit);
  const top3 = ranked.slice(0, 3);
  if (top3.length === 0) return { operation_id: op.id, operation: op.name, skipped: "no_creatives_today" };

  const fmtCompact = (v: number) => Math.round(Math.abs(v)).toLocaleString("pt-BR");
  const vars: Record<string, string> = {
    criativo_1: top3[0]?.name ?? "—", lucro_1: top3[0] ? fmtCompact(top3[0].profit) : "0",
    criativo_2: top3[1]?.name ?? "—", lucro_2: top3[1] ? fmtCompact(top3[1].profit) : "0",
    criativo_3: top3[2]?.name ?? "—", lucro_3: top3[2] ? fmtCompact(top3[2].profit) : "0",
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "ranking_criativos", url: "/" });
  await logAutomatedReport(sb, op.id, "ranking-criativos", `${title}\n${body}`,
    { top3: top3.map(c => ({ name: c.name, profit: c.profit, revenue: c.revenue, spend: c.spend })) }, results);

  return { operation_id: op.id, operation: op.name, top3: top3.map(c => ({ name: c.name, profit: c.profit })), results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = brDate();
    const onlyOp = await readOnlyOp(req);
    const ops = await listActiveOperations(sb, onlyOp);

    const summaries: any[] = [];
    for (const op of ops) {
      try { summaries.push(await processOperation(sb, today, op)); }
      catch (e) { console.error(`[notify-ranking-criativos] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-ranking-criativos error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
