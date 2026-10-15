import { createClient } from "npm:@supabase/supabase-js@2";
import { brDate, fmtBRL, replaceVars, spDayBounds, listActiveOperations, fetchOpTemplate, fetchOpRecipients, sendToRecipients, logAutomatedReport, readOnlyOp } from "../_shared/notify-scope.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const jsonRes = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fmtCompact = (v: number) => Math.round(Math.abs(v)).toLocaleString("pt-BR");

async function fetchAll(sb: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE=1000; let all: any[] = []; let from = 0;
  while (true) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from+PAGE-1);
    if (error) { console.error(`fetchAll ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length||0) < PAGE) break; from += PAGE;
  }
  return all;
}

function normalizeHBId(raw: string): string {
  const m = raw.match(/^(H\d{1,2})(B\d{1,2})(.*)/i);
  if (m) {
    const h = m[1].toUpperCase().replace(/H(\d{1,2})/, (_: string, d: string) => `H${d.padStart(2,"0")}`);
    const b = m[2].toUpperCase().replace(/B(\d{1,2})/, (_: string, d: string) => `B${d.padStart(2,"0")}`);
    const suf = m[3] ? m[3].trim().toUpperCase() : "";
    return suf ? `${h}${b}${suf.startsWith("-") ? suf : `-${suf}`}`.replace(/-$/, "") : `${h}${b}`;
  }
  return raw.toUpperCase();
}
function extractSecondBracketTag(t?: string | null): string | null {
  if (!t) return null;
  const all = t.match(/\[([^\]]+)\]/g);
  if (!all || all.length < 2) return null;
  let raw = all[1].replace(/^\[|\]$/g, "").trim();
  if (!raw) return null;
  raw = raw.replace(/\s*\[.*$/, "").trim();
  return raw ? normalizeHBId(raw) : null;
}
const resolveCreativeId = (n?: string | null) => extractSecondBracketTag(n) ?? "SEM_ID";

async function processOp(sb: any, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "img_estrutura");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const { startUtc, endUtc } = spDayBounds(today);
  const trafficRows = await fetchAll(sb, "traffic_data", "campaign_name, ad_name, spend, clicks", (q: any) =>
    q.eq("operation_id", op.id).eq("date", today).ilike("campaign_name", "%IMG%").gt("spend", 0));
  if (!trafficRows.length) return { operation_id: op.id, operation: op.name, skipped: "no_img_campaigns" };

  const cbRows = await fetchAll(sb, "clickbank_audit", "receipt, amount_brl, aff_sub2", (q: any) =>
    q.eq("operation_id", op.id).eq("date", today).eq("transaction_type","SALE").gte("amount_usd", 180).lte("amount_usd", 250));

  const campaignIds = [...new Set(cbRows.filter((r: any) => r.aff_sub2).map((r: any) => r.aff_sub2))];
  const campaignMap = new Map<string, string>();
  if (campaignIds.length) {
    const { data: mcs } = await sb.from("meta_campaign_status")
      .select("campaign_id, campaign_name").eq("operation_id", op.id).in("campaign_id", campaignIds);
    for (const m of mcs || []) campaignMap.set(m.campaign_id, m.campaign_name);
  }

  const rtRows = await fetchAll(sb, "redtrack_events", "amount, currency, utm_campaign", (q: any) =>
    q.eq("operation_id", op.id).eq("event_type", "purchase").gt("amount", 0)
     .gte("occurred_at", startUtc).lt("occurred_at", endUtc));

  const { data: rate } = await sb.from("exchange_rate_log").select("rate").order("created_at", { ascending: false }).limit(1).single();
  const usdToBrl = Number(rate?.rate ?? 0) > 0 ? Number(rate!.rate) : 5.15;

  const creativeRevenue = new Map<string, number>();
  const seen = new Set<string>();
  let totalCbSales = 0;
  for (const cb of cbRows) {
    if (seen.has(cb.receipt)) continue;
    const cn = campaignMap.get(cb.aff_sub2 || "");
    if (!cn || !cn.toUpperCase().includes("IMG")) continue;
    seen.add(cb.receipt); totalCbSales++;
    const k = resolveCreativeId(cn);
    creativeRevenue.set(k, (creativeRevenue.get(k)||0) + Number(cb.amount_brl||0));
  }
  for (const r of rtRows) {
    if (!r.utm_campaign || !r.utm_campaign.toUpperCase().includes("IMG")) continue;
    const k = resolveCreativeId(r.utm_campaign);
    if (!creativeRevenue.has(k)) {
      const brl = r.currency === "BRL" ? (r.amount||0) : (r.amount||0) * usdToBrl;
      creativeRevenue.set(k, (creativeRevenue.get(k)||0) + brl);
    }
  }

  const creativeSpend = new Map<string, number>();
  const creativeClicks = new Map<string, number>();
  for (const t of trafficRows) {
    const k = resolveCreativeId(t.campaign_name);
    creativeSpend.set(k, (creativeSpend.get(k)||0) + (t.spend||0));
    creativeClicks.set(k, (creativeClicks.get(k)||0) + (t.clicks||0));
  }

  const keys = new Set([...creativeRevenue.keys(), ...creativeSpend.keys()]);
  let totalInvest=0, totalFat=0, totalClicks=0;
  let best = { name: "—", profit: -Infinity };
  for (const k of keys) {
    const rev = creativeRevenue.get(k) || 0;
    const sp = creativeSpend.get(k) || 0;
    const cl = creativeClicks.get(k) || 0;
    totalInvest += sp; totalFat += rev; totalClicks += cl;
    const p = rev - sp; if (p > best.profit) best = { name: k, profit: p };
  }
  const totalSales = totalCbSales;
  const lucro = totalFat - totalInvest;
  const roas = totalInvest>0 ? totalFat/totalInvest : 0;
  const cpa = totalSales>0 ? totalInvest/totalSales : 0;
  const cpc = totalClicks>0 ? totalInvest/totalClicks : 0;

  if (totalInvest < 1) return { operation_id: op.id, operation: op.name, skipped: "no_img_spend" };

  const vars: Record<string,string> = {
    invest: fmtBRL(totalInvest), fat: fmtBRL(totalFat), lucro: fmtBRL(lucro),
    roas: roas.toFixed(2), cpa: fmtBRL(cpa), cpc: fmtBRL(cpc),
    nome_criativo: best.name !== "—" ? best.name : "N/A",
    lucro_criativo: best.profit > -Infinity ? fmtCompact(best.profit) : "0",
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "img_estrutura", url: "/" });
  await logAutomatedReport(sb, op.id, "img-estrutura", `${title}\n${body}`,
    { totalInvest, totalFat, totalLucro: lucro, roas, cpa, cpc, totalSales, bestCreative: best }, results);

  return { operation_id: op.id, operation: op.name, totalInvest, totalFat, lucro, results };
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
      try { summaries.push(await processOp(sb, today, op)); }
      catch (e) { console.error(`[img-estrutura] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-img-estrutura error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
