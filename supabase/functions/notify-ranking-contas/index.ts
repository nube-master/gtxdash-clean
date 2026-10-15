import { createClient } from "npm:@supabase/supabase-js@2";
import {
  brDate, fmtBRL, replaceVars, spDayBounds,
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

function smartMergeSales(salesRows: any[], rtRows: any[]): any[] {
  const cbRev = new Map<string, number>();
  for (const s of salesRows) {
    const isCB = (s.store || "").toLowerCase() === "clickbank" || (s.order_id || "").toLowerCase().includes("clickbank");
    if (!isCB || s.status !== "approved") continue;
    cbRev.set(s.date, (cbRev.get(s.date) || 0) + Number(s.revenue || 0));
  }
  const rtRev = new Map<string, number>();
  for (const r of rtRows) {
    if (!r.date) continue;
    rtRev.set(r.date, (rtRev.get(r.date) || 0) + Number(r.revenue || 0));
  }
  const excludeCB = new Set<string>(), excludeRT = new Set<string>();
  for (const d of new Set([...cbRev.keys(), ...rtRev.keys()])) {
    const c = cbRev.get(d) || 0, r = rtRev.get(d) || 0;
    if (r > 0 && c > 0) { if (r >= c) excludeCB.add(d); else excludeRT.add(d); }
  }
  const fSales = salesRows.filter((s: any) => {
    if (s.status !== "approved") return false;
    const isCB = (s.store || "").toLowerCase() === "clickbank" || (s.order_id || "").toLowerCase().includes("clickbank");
    if (isCB && excludeCB.has(s.date)) return false;
    if ((s.store || "").toLowerCase() === "clickbank_ref") return false;
    return true;
  });
  const fRT = rtRows.filter((s: any) => !excludeRT.has(s.date));
  return [...fSales, ...fRT];
}

async function processOperation(sb: any, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "ranking_contas");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const { startUtc, endUtc } = spDayBounds(today);

  const [trafficRows, salesRows, rtRawRows, accountRows, rateRow, campaignRows, aliasRows] = await Promise.all([
    fetchAll(sb, "traffic_data", "account_id, campaign_name, spend",
      (q: any) => q.eq("date", today).eq("operation_id", op.id)),
    fetchAll(sb, "sales_data", "revenue, date, status, store, order_id, utm_campaign, utm_content, utm_source, utm_term",
      (q: any) => q.eq("date", today).eq("status", "approved").eq("operation_id", op.id)
        .or("store.neq.clickbank_ref,store.is.null")),
    fetchAll(sb, "redtrack_events", "amount, currency, occurred_at, utm_campaign, utm_content, utm_source, utm_term, event_type",
      (q: any) => q.in("event_type", ["purchase", "upsell"]).gt("amount", 0)
        .gte("occurred_at", startUtc).lt("occurred_at", endUtc).eq("operation_id", op.id)),
    sb.from("meta_ad_accounts").select("account_id, account_name, currency")
      .eq("is_active", true).eq("operation_id", op.id).then((r: any) => r.data || []),
    sb.from("exchange_rate_log").select("rate").order("created_at", { ascending: false }).limit(1).single().then((r: any) => r.data),
    fetchAll(sb, "meta_campaign_status", "account_id, campaign_name",
      (q: any) => q.eq("operation_id", op.id)),
    sb.from("account_utm_aliases").select("account_id, utm_aliases")
      .eq("operation_id", op.id).then((r: any) => r.data || []),
  ]);

  const usdToBrl = rateRow?.rate > 0 ? Number(rateRow.rate) : 5.15;

  const rtNormalized = rtRawRows.map((r: any) => {
    const amt = Number(r.amount || 0);
    const revBrl = (r.currency || "USD") === "BRL" ? amt : amt * usdToBrl;
    const spDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(r.occurred_at));
    return { date: spDate, revenue: revBrl, status: "approved",
      utm_campaign: r.utm_campaign, utm_content: r.utm_content, utm_source: r.utm_source, utm_term: r.utm_term, _source: "redtrack" };
  });

  const mergedSales = smartMergeSales(salesRows, rtNormalized);

  const spendByAccount = new Map<string, number>();
  for (const t of trafficRows) spendByAccount.set(t.account_id, (spendByAccount.get(t.account_id) || 0) + (t.spend || 0));

  const aliasMap = new Map<string, string>();
  for (const a of aliasRows) for (const al of (a.utm_aliases || [])) aliasMap.set(String(al).toLowerCase(), a.account_id);

  const tagToAccount = new Map<string, string>();
  const campaignNameToAccount = new Map<string, string>();
  for (const c of campaignRows) {
    const name = c.campaign_name || "", accId = c.account_id;
    const m = name.match(/\[([^\]]+)\]/);
    if (m) { const tag = m[1].toLowerCase(); if (!tagToAccount.has(tag)) tagToAccount.set(tag, accId); }
    const cn = name.toLowerCase().trim();
    if (cn && !campaignNameToAccount.has(cn)) campaignNameToAccount.set(cn, accId);
  }

  const revenueByAccount = new Map<string, number>();
  const salesByAccount = new Map<string, number>();
  let unattributed = 0;

  for (const s of mergedSales) {
    let acc: string | null = null;
    if (aliasMap.size > 0) {
      const fields = [s.utm_campaign, s.utm_content, s.utm_source, s.utm_term].filter(Boolean);
      for (const f of fields) {
        const lower = String(f).toLowerCase();
        for (const [al, id] of aliasMap.entries()) if (lower.includes(al)) { acc = id; break; }
        if (acc) break;
      }
    }
    if (!acc && s.utm_campaign) {
      const m = String(s.utm_campaign).match(/\[([^\]]+)\]/);
      if (m) { const id = tagToAccount.get(m[1].toLowerCase()); if (id) acc = id; }
    }
    if (!acc && s.utm_campaign) {
      const id = campaignNameToAccount.get(String(s.utm_campaign).toLowerCase().trim());
      if (id) acc = id;
    }
    if (acc) {
      revenueByAccount.set(acc, (revenueByAccount.get(acc) || 0) + Number(s.revenue));
      salesByAccount.set(acc, (salesByAccount.get(acc) || 0) + 1);
    } else unattributed += Number(s.revenue);
  }

  if (unattributed > 0) {
    const wSales = Array.from(salesByAccount.entries()).filter(([, c]) => c > 0);
    const totalSp = wSales.reduce((s, [id]) => s + (spendByAccount.get(id) || 0), 0);
    if (totalSp > 0) for (const [id] of wSales) {
      const sp = spendByAccount.get(id) || 0;
      revenueByAccount.set(id, (revenueByAccount.get(id) || 0) + unattributed * (sp / totalSp));
    }
  }

  const info = new Map<string, { name: string; currency: string }>();
  for (const a of accountRows) info.set(a.account_id, { name: a.account_name, currency: a.currency });

  interface AccountRank { account_id: string; label: string; spend: number; revenue: number; profit: number; vendas: number; roas: number; }
  const ranked: AccountRank[] = [];
  const all = new Set([...spendByAccount.keys(), ...revenueByAccount.keys()]);
  for (const id of all) {
    const sp = spendByAccount.get(id) || 0, rv = revenueByAccount.get(id) || 0;
    if (sp < 1 && rv < 1) continue;
    const vd = salesByAccount.get(id) || 0;
    const meta = info.get(id);
    const label = meta ? (meta.name || id.slice(-6)).replace(/^act_/i, "").trim() : id;
    ranked.push({ account_id: id, label, spend: sp, revenue: rv, profit: rv - sp, vendas: vd, roas: sp > 0 ? rv / sp : 0 });
  }
  ranked.sort((a, b) => b.profit - a.profit);
  const top3 = ranked.slice(0, 3);
  if (top3.length === 0) return { operation_id: op.id, operation: op.name, skipped: "no_accounts_with_data" };

  const fmtCompact = (v: number) => Math.round(Math.abs(v)).toLocaleString("pt-BR");
  const vars: Record<string, string> = {
    conta_1: top3[0]?.label || "—", lucro_1: top3[0] ? fmtCompact(top3[0].profit) : "0",
    conta_2: top3[1]?.label || "—", lucro_2: top3[1] ? fmtCompact(top3[1].profit) : "0",
    conta_3: top3[2]?.label || "—", lucro_3: top3[2] ? fmtCompact(top3[2].profit) : "0",
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "ranking_contas", url: "/" });
  await logAutomatedReport(sb, op.id, "ranking-contas", `${title}\n${body}`,
    { top3: top3.map(a => ({ label: a.label, spend: a.spend, revenue: a.revenue, profit: a.profit, vendas: a.vendas, roas: a.roas })) }, results);

  return { operation_id: op.id, operation: op.name, top3, results };
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
      catch (e) { console.error(`[notify-ranking-contas] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-ranking-contas error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
