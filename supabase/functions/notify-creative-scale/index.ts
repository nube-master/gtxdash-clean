import { createClient } from "npm:@supabase/supabase-js@2";
import { brDate, replaceVars, listActiveOperations, fetchOpTemplate, fetchOpRecipients, sendToRecipients, logAutomatedReport, readOnlyOp } from "../_shared/notify-scope.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const jsonRes = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

function extractCreativeId(name: string): string | null {
  const m = name.match(/\[(IMG\d+)\]/i);
  if (m) return m[1].toUpperCase();
  const all = name.match(/\[([^\]]+)\]/g);
  if (all && all.length >= 2) return all[1].replace(/[\[\]]/g, "").trim();
  return null;
}

async function processOp(sb: any, today: string, op: { id: string; name: string }) {
  const trafficRows = await fetchAll(sb, "traffic_data", "campaign_name, spend", (q: any) =>
    q.eq("operation_id", op.id).eq("date", today).ilike("campaign_name", "%1-50-1%").gt("spend", 0));
  if (!trafficRows.length) return { operation_id: op.id, operation: op.name, skipped: "no_test_campaigns" };

  const tierCampaignNames = new Set<string>();
  const creativeSpend = new Map<string, number>();
  for (const t of trafficRows) {
    const n = t.campaign_name || "";
    tierCampaignNames.add(n);
    const cid = extractCreativeId(n); if (!cid) continue;
    creativeSpend.set(cid, (creativeSpend.get(cid)||0) + (t.spend||0));
  }

  const { data: mcsRows } = await sb.from("meta_campaign_status")
    .select("campaign_id, campaign_name").eq("operation_id", op.id);
  const tierCampaignIds = new Set<string>();
  for (const m of mcsRows || []) if (tierCampaignNames.has(m.campaign_name)) tierCampaignIds.add(m.campaign_id);

  const { data: cbRows } = await sb.from("clickbank_audit")
    .select("receipt, amount_brl, aff_sub2")
    .eq("operation_id", op.id).eq("date", today).eq("transaction_type","SALE")
    .gte("amount_usd", 180).lte("amount_usd", 250);

  const creativeRevenue = new Map<string, number>();
  const creativeSales = new Map<string, number>();
  const seen = new Set<string>();
  for (const cb of cbRows || []) {
    const r = String(cb.receipt||"").trim();
    if (!r || seen.has(r)) continue;
    const cid = cb.aff_sub2;
    if (!cid || !tierCampaignIds.has(cid)) continue;
    const mcs = (mcsRows||[]).find((m: any) => m.campaign_id === cid);
    if (!mcs) continue;
    const key = extractCreativeId(mcs.campaign_name);
    if (!key || !creativeSpend.has(key)) continue;
    seen.add(r);
    creativeRevenue.set(key, (creativeRevenue.get(key)||0) + Number(cb.amount_brl||0));
    creativeSales.set(key, (creativeSales.get(key)||0) + 1);
  }

  const candidates: { name: string; roi: number; sales: number; profit: number }[] = [];
  for (const [name, sp] of creativeSpend) {
    if (sp <= 0) continue;
    const rev = creativeRevenue.get(name) || 0;
    const sales = creativeSales.get(name) || 0;
    const roi = rev / sp;
    if (roi >= 1.80 && sales >= 2) candidates.push({ name, roi, sales, profit: rev - sp });
  }
  if (!candidates.length) return { operation_id: op.id, operation: op.name, skipped: "no_creatives_meeting_criteria" };
  candidates.sort((a,b) => b.profit - a.profit);

  const { data: todayLogs } = await sb.from("automated_reports_log")
    .select("metrics")
    .eq("operation_id", op.id)
    .in("report_type", ["creative-scale-alert","creative-scale-up-alert"])
    .gte("created_at", `${today}T00:00:00Z`);
  const already = new Set<string>();
  for (const l of todayLogs || []) {
    const n = (l.metrics as any)?.notified_creatives;
    if (Array.isArray(n)) n.forEach((x: string) => already.add(x));
  }
  const news = candidates.filter(c => !already.has(c.name));
  if (!news.length) return { operation_id: op.id, operation: op.name, skipped: "all_already_notified" };

  const tpl = await fetchOpTemplate(sb, op.id, "creative_scale_alert");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results: any[] = [];
  const notified: string[] = [];
  for (const c of news) {
    const vars = { criativo_nome: c.name, roi: c.roi.toFixed(2), vendas: String(c.sales), operacao: op.name };
    const title = replaceVars(tpl.title_template, vars);
    const body = replaceVars(tpl.body_template, vars);
    const r = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "creative_scale_alert", url: "/" });
    r.forEach(x => results.push({ ...x, creative: c.name }));
    notified.push(c.name);
  }
  await logAutomatedReport(sb, op.id, "creative-scale-alert",
    news.map(c => `${c.name} ROI ${c.roi.toFixed(2)} | ${c.sales} vendas`).join("\n"),
    { notified_creatives: notified, candidates: news, tier: "1-50-1" }, results);

  return { operation_id: op.id, operation: op.name, notified, results };
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
      catch (e) { console.error(`[creative-scale] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-creative-scale error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
