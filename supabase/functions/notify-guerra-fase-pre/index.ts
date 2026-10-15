import { createClient } from "npm:@supabase/supabase-js@2";
import { brDate, fmtBRL, spDayBounds, listActiveOperations, fetchOpTemplate, fetchOpRecipients, sendToRecipients, logAutomatedReport, readOnlyOp } from "../_shared/notify-scope.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const jsonRes = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FASE_KEY = "PRE", FASE_LABEL = "PRÉ-ESCALA (1-100-1)", FASE_EMOJI = "🟠";
const TEMPLATE_TYPE = "guerra_fase_pre", REPORT_TYPE = "guerra-fase-pre";

const isFase = (n: string) => /1-100-1(?!\d)/.test((n||"").toUpperCase());
const isPrimaryCb = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) && n >= 200 && n <= 260; };

async function fetchAll(sb: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE = 1000; let all: any[] = []; let from = 0;
  while (true) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from + PAGE - 1);
    if (error) { console.error(`[${REPORT_TYPE}] ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length || 0) < PAGE) break; from += PAGE;
  }
  return all;
}

function buildDiag(rev: number, gasto: number, lucro: number, roas: number): string {
  if (gasto === 0) return "⚠️ Sem Pré-Escala hoje.";
  if (lucro < 0 && roas < 0.5) return "🆘 Pré-Escala sangrando.";
  if (lucro < 0) return "⚠️ Pré-Escala no vermelho.";
  if (roas >= 2) return "🔥 Pré-Escala validando forte.";
  if (roas >= 1) return "✅ Pré-Escala saudável.";
  return "📊 Pré-Escala próxima do break-even.";
}

async function processOp(sb: any, supabaseUrl: string, serviceKey: string, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, TEMPLATE_TYPE);
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  let usdToBrl = 5.15;
  try {
    const url = `${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&force_live=true&operation_id=${op.id}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } });
    if (r.ok) { const d = await r.json(); if (d.usdToBrl > 0) usdToBrl = Number(d.usdToBrl); }
  } catch {}

  const { startUtc, endUtc } = spDayBounds(today);
  const [trafficRows, cbRows, mcsRows, rtRows] = await Promise.all([
    fetchAll(sb, "traffic_data", "campaign_name, spend", (q: any) => q.eq("operation_id", op.id).eq("date", today).gt("spend", 0)),
    fetchAll(sb, "clickbank_audit", "receipt, amount_brl, amount_usd, aff_sub2, aff_sub3", (q: any) => q.eq("operation_id", op.id).eq("date", today).eq("transaction_type","SALE").gt("amount_brl", 0)),
    fetchAll(sb, "meta_campaign_status", "campaign_id, campaign_name", (q: any) => q.eq("operation_id", op.id)),
    fetchAll(sb, "redtrack_events", "utm_campaign, amount, currency, raw_payload", (q: any) => q.eq("operation_id", op.id).eq("event_type","purchase").gte("occurred_at", startUtc).lt("occurred_at", endUtc).gt("amount", 0)),
  ]);

  let gasto = 0;
  for (const r of trafficRows) if (isFase(r.campaign_name||"")) gasto += Number(r.spend||0);
  const idToName = new Map<string,string>();
  for (const c of mcsRows) { const id=String(c.campaign_id||"").trim(); const n=String(c.campaign_name||"").trim(); if(id&&n&&!idToName.has(id)) idToName.set(id,n); }
  const receiptToRt = new Map<string,string>();
  for (const rt of rtRows) { const rc=String(rt.raw_payload?.p_sub1||rt.raw_payload?.receipt||rt.raw_payload?.order||"").trim(); if(!rc) continue; const u=String(rt.utm_campaign||"").trim(); if(u&&!receiptToRt.has(rc)) receiptToRt.set(rc,u); }

  let receita = 0, cbTotal = 0;
  for (const cb of cbRows.filter((c: any) => isPrimaryCb(c.amount_usd))) {
    const amt = Number(cb.amount_brl||0); if (amt<=0) continue;
    cbTotal += amt;
    const cid = String(cb.aff_sub2||cb.aff_sub3||"").trim();
    const byId = cid ? (idToName.get(cid)||"") : "";
    const byRc = receiptToRt.get(String(cb.receipt||"").trim())||"";
    if (isFase(byId)||isFase(byRc)) receita += amt;
  }
  if (cbTotal === 0) {
    for (const rt of rtRows) {
      if (!isFase(rt.utm_campaign||"")) continue;
      const a = Number(rt.amount||0); if (a<=0) continue;
      receita += (rt.currency||"").toUpperCase()==="BRL" ? a : a*usdToBrl;
    }
  }

  const lucro = receita - gasto;
  const roas = gasto>0 ? receita/gasto : 0;
  const diagnostico = buildDiag(receita, gasto, lucro, roas);

  const title = `⚔️ Guerra de Fases ${op.name} — ${FASE_LABEL}`;
  const body = [
    `${FASE_EMOJI} ${FASE_LABEL}`,
    `💰 Lucro: R$ ${fmtBRL(lucro)}`,
    `📈 ROAS: ${roas.toFixed(2)}x`,
    `💵 Receita: R$ ${fmtBRL(receita)}`,
    `🔥 Gasto: R$ ${fmtBRL(gasto)}`,
    "",
    `🧠 ${diagnostico}`,
  ].join("\n");

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "guerra_fase_pre", url: "/" });
  await logAutomatedReport(sb, op.id, REPORT_TYPE, `${title}\n${body}`, { fase: FASE_KEY, receita, gasto, lucro, roas, diagnostico }, results);
  return { operation_id: op.id, operation: op.name, receita, gasto, lucro, roas, results };
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
      catch (e) { console.error(`[${REPORT_TYPE}] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error(`${REPORT_TYPE} error:`, err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
