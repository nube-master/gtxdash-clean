import { createClient } from "npm:@supabase/supabase-js@2";
import { brDate, fmtBRL, replaceVars, spDayBounds, listActiveOperations, fetchOpTemplate, fetchOpRecipients, sendToRecipients, logAutomatedReport, readOnlyOp } from "../_shared/notify-scope.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const jsonRes = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LL10_TAG = "[LL10%]";
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
  const tpl = await fetchOpTemplate(sb, op.id, "guerra_estruturas_03");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  let usdToBrl = 5.15;
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&operation_id=${op.id}`, { headers: { Authorization:`Bearer ${serviceKey}`, apikey: serviceKey } });
    if (r.ok) { const d = await r.json(); if (d.usdToBrl > 0) usdToBrl = Number(d.usdToBrl); }
  } catch {}

  const { startUtc, endUtc } = spDayBounds(today);
  const [trafficRows, rtRowsAll, cbRows] = await Promise.all([
    fetchAll(sb, "traffic_data", "campaign_name, spend", (q: any) => q.eq("operation_id", op.id).eq("date", today).gt("spend", 0)),
    fetchAll(sb, "redtrack_events", "utm_campaign, amount, currency, raw_payload, event_type", (q: any) => q.eq("operation_id", op.id).in("event_type",["purchase","upsell"]).gte("occurred_at", startUtc).lt("occurred_at", endUtc)),
    fetchAll(sb, "clickbank_audit", "receipt, amount_brl", (q: any) => q.eq("operation_id", op.id).eq("date", today).eq("transaction_type","SALE")),
  ]);
  const rt = rtRowsAll.filter((e: any) => e.event_type==="purchase" && Number(e.amount||0)>0);

  const receiptMap = new Map<string, number>();
  for (const r of cbRows) { const rc=String(r.receipt||"").trim(); const a=Number(r.amount_brl||0); if (rc && a>0 && !receiptMap.has(rc)) receiptMap.set(rc, a); }

  let spendLl = 0;
  const camps = new Set<string>();
  for (const row of trafficRows) {
    const n = row.campaign_name||"";
    if (hasTag(n, LL10_TAG)) { spendLl += Number(row.spend||0); camps.add(n); }
  }
  const countCampaigns = camps.size;

  let revLl = 0, salesCount = 0;
  for (const e of rt) {
    if (!hasTag(e.utm_campaign||"", LL10_TAG)) continue;
    let brl: number;
    const rc = e.raw_payload?.p_sub1 || e.raw_payload?.receipt || null;
    const audit = rc ? receiptMap.get(String(rc).trim()) : undefined;
    if ((e.currency||"").toUpperCase()==="BRL") brl = Number(e.amount||0);
    else if (typeof audit === "number" && audit > 0) brl = audit;
    else brl = Number(e.amount||0) * usdToBrl;
    revLl += brl; salesCount++;
  }

  const lucroLl = revLl - spendLl;
  const roasLl = spendLl>0 ? revLl/spendLl : 0;
  const cpaLl = salesCount>0 ? spendLl/salesCount : 0;

  const vars: Record<string,string> = {
    lucro_ll10: fmtBRL(lucroLl), roas_ll10: roasLl.toFixed(2), receita_ll10: fmtBRL(revLl),
    gasto_ll10: fmtBRL(spendLl), cpa_ll10: fmtBRL(cpaLl), vendas_ll10: String(salesCount),
    campanhas_ll10: String(countCampaigns), operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "guerra_estruturas_03", url: "/" });
  await logAutomatedReport(sb, op.id, "guerra-estruturas-03", `${title}\n${body}`, {
    ll10: { receita: revLl, gasto: spendLl, lucro: lucroLl, roas: roasLl, vendas: salesCount, campanhas: countCampaigns, cpa: cpaLl },
  }, results);

  return { operation_id: op.id, operation: op.name, ll10: { receita: revLl, gasto: spendLl, lucro: lucroLl, roas: roasLl }, results };
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
      catch (e) { console.error(`[guerra-estruturas-03] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-guerra-estruturas-03 error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
