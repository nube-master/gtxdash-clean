import { createClient } from "npm:@supabase/supabase-js@2";
import { brDate, fmtBRL, replaceVars, spDayBounds, listActiveOperations, fetchOpTemplate, fetchOpRecipients, sendToRecipients, logAutomatedReport, readOnlyOp } from "../_shared/notify-scope.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const jsonRes = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CBO_TAG = "[CBO]";
const hasTag = (n: string, t: string) => (n||"").toUpperCase().includes(t.toUpperCase());

async function fetchAll(sb: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE=1000; let all: any[] = []; let from = 0;
  while (true) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from+PAGE-1);
    if (error) break;
    all = all.concat(data || []);
    if ((data?.length||0) < PAGE) break; from += PAGE;
  }
  return all;
}

async function processOp(sb: any, supabaseUrl: string, serviceKey: string, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "guerra_estruturas_04");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  let usdToBrl = 5.15;
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&operation_id=${op.id}`, { headers: { Authorization:`Bearer ${serviceKey}`, apikey: serviceKey } });
    if (r.ok) { const d = await r.json(); if (d.usdToBrl > 0) usdToBrl = Number(d.usdToBrl); }
  } catch {}

  const { startUtc, endUtc } = spDayBounds(today);
  const [trafficRows, rtRows, cbRows] = await Promise.all([
    fetchAll(sb, "traffic_data", "campaign_name, spend", (q: any) => q.eq("operation_id", op.id).eq("date", today).gt("spend", 0)),
    fetchAll(sb, "redtrack_events", "clickid, utm_campaign, amount, currency, raw_payload, event_type", (q: any) => q.eq("operation_id", op.id).in("event_type",["purchase","initiate_checkout"]).gte("occurred_at", startUtc).lt("occurred_at", endUtc)),
    fetchAll(sb, "clickbank_audit", "receipt, amount_brl", (q: any) => q.eq("operation_id", op.id).eq("date", today).eq("transaction_type","SALE")),
  ]);

  const receiptMap = new Map<string, number>();
  for (const r of cbRows) { const rc=String(r.receipt||"").trim(); const a=Number(r.amount_brl||0); if (rc && a>0 && !receiptMap.has(rc)) receiptMap.set(rc, a); }

  let spendCbo = 0;
  const camps = new Set<string>();
  for (const row of trafficRows) {
    const n = row.campaign_name||"";
    if (hasTag(n, CBO_TAG)) { spendCbo += Number(row.spend||0); camps.add(n); }
  }
  const countCampaigns = camps.size;

  let revCbo = 0, salesCount = 0, icCount = 0;
  for (const e of rtRows) {
    if (!hasTag(e.utm_campaign||"", CBO_TAG)) continue;
    if (e.event_type === "initiate_checkout") { icCount++; continue; }
    if (Number(e.amount||0) <= 0) continue;
    const rp = e.raw_payload || {};
    const strong = e.clickid || rp.clickid || rp.transaction_id || rp.p_sub1 || rp.receipt || rp.order_id || rp.sub_id || rp.payout_default;
    if (!strong || String(strong).trim() === "") continue;
    let brl: number;
    const rc = rp.p_sub1 || rp.receipt || null;
    const audit = rc ? receiptMap.get(String(rc).trim()) : undefined;
    if ((e.currency||"").toUpperCase()==="BRL") brl = Number(e.amount||0);
    else if (typeof audit === "number" && audit > 0) brl = audit;
    else brl = Number(e.amount||0) * usdToBrl;
    revCbo += brl; salesCount++;
  }

  const lucroCbo = revCbo - spendCbo;
  const roasCbo = spendCbo>0 ? revCbo/spendCbo : 0;
  const cpiCbo = icCount>0 ? spendCbo/icCount : 0;

  const vars: Record<string,string> = {
    lucro_cbo: fmtBRL(lucroCbo), roas_cbo: roasCbo.toFixed(2), receita_cbo: fmtBRL(revCbo),
    gasto_cbo: fmtBRL(spendCbo), ic_cbo: String(icCount), cpi_cbo: fmtBRL(cpiCbo),
    campanhas_cbo: String(countCampaigns), vendas_cbo: String(salesCount), operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "guerra_estruturas_04", url: "/" });
  await logAutomatedReport(sb, op.id, "guerra-estruturas-04", `${title}\n${body}`, {
    cbo: { receita: revCbo, gasto: spendCbo, lucro: lucroCbo, roas: roasCbo, ic: icCount, cpi: cpiCbo, vendas: salesCount, campanhas: countCampaigns },
  }, results);

  return { operation_id: op.id, operation: op.name, cbo: { receita: revCbo, gasto: spendCbo, lucro: lucroCbo, roas: roasCbo }, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.clone().json().catch(() => null);
    const today = body?.date || brDate();
    const onlyOp = await readOnlyOp(req);
    const ops = await listActiveOperations(sb, onlyOp);
    const summaries: any[] = [];
    for (const op of ops) {
      try { summaries.push(await processOp(sb, supabaseUrl, serviceKey, today, op)); }
      catch (e) { console.error(`[guerra-estruturas-04] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-guerra-estruturas-04 error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
