import { createClient } from "npm:@supabase/supabase-js@2";
import {
  brDate, fmtBRL, spDayBounds,
  listActiveOperations, fetchOpTemplate, fetchOpRecipients,
  sendToRecipients, logAutomatedReport, readOnlyOp,
} from "../_shared/notify-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonRes = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Fase = "TESTE" | "PRE" | "ESCALA" | null;
function detectFase(name: string): Fase {
  const u = (name || "").toUpperCase();
  if (u.includes("1-250-1")) return "ESCALA";
  if (u.includes("1-100-1")) return "PRE";
  if (u.includes("1-50-1")) return "TESTE";
  return null;
}
const isPrimaryCb = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) && n >= 200 && n <= 260; };

async function fetchAll(sb: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE = 1000; let all: any[] = []; let from = 0;
  while (true) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from + PAGE - 1);
    if (error) { console.error(`[guerra-fases] ${table}:`, error.message); break; }
    all = all.concat(data || []);
    if ((data?.length || 0) < PAGE) break;
    from += PAGE;
  }
  return all;
}

interface M { receita: number; gasto: number; lucro: number; roas: number }
function diag(t: M, p: M, e: M): string {
  const tN = t.gasto>0&&t.lucro<0, pN = p.gasto>0&&p.lucro<0, eN = e.gasto>0&&e.lucro<0;
  const tP = t.gasto>0&&t.roas>=1, pP = p.gasto>0&&p.roas>=1, eP = e.gasto>0&&e.roas>=1;
  if (eN&&pP&&tP) return "🚨 Funil quebrado: Teste e Pré validando bem mas Escala sangrando.";
  if (eN&&pN&&tP) return "⚠️ Promoção precoce — segurar mais tempo em 1-50-1.";
  if (tN&&pP&&eP) return "✅ Funil saudável.";
  if (tP&&pP&&eP) return "🔥 Funil dos sonhos — escalar agressivo.";
  if (tN&&pN&&eN) return "🆘 Todas as fases no vermelho.";
  if (tP&&pN) return "⚠️ Vazamento na Pré-Escala.";
  if (pP&&eN) return "⚠️ Vazamento na Escala.";
  if (t.gasto===0) return "⚠️ Sem Teste hoje.";
  if (p.gasto===0 && t.gasto>0) return "⚠️ Sem Pré-Escala ativa.";
  return "📊 Operação dentro do esperado.";
}

async function processOp(sb: any, supabaseUrl: string, serviceKey: string, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "guerra_fases");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  let usdToBrl = 5.15;
  try {
    const url = `${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&force_live=true&operation_id=${op.id}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } });
    if (r.ok) { const d = await r.json(); if (d.usdToBrl > 0) usdToBrl = Number(d.usdToBrl); }
  } catch { /* keep fallback */ }

  const { startUtc, endUtc } = spDayBounds(today);
  const [trafficRows, cbRows, mcsRows, rtRows] = await Promise.all([
    fetchAll(sb, "traffic_data", "campaign_name, spend", (q: any) => q.eq("operation_id", op.id).eq("date", today).gt("spend", 0)),
    fetchAll(sb, "clickbank_audit", "receipt, amount_brl, amount_usd, aff_sub2, aff_sub3", (q: any) => q.eq("operation_id", op.id).eq("date", today).eq("transaction_type", "SALE").gt("amount_brl", 0)),
    fetchAll(sb, "meta_campaign_status", "campaign_id, campaign_name", (q: any) => q.eq("operation_id", op.id)),
    fetchAll(sb, "redtrack_events", "utm_campaign, amount, currency, raw_payload", (q: any) => q.eq("operation_id", op.id).eq("event_type", "purchase").gte("occurred_at", startUtc).lt("occurred_at", endUtc).gt("amount", 0)),
  ]);

  const fases: Record<"TESTE"|"PRE"|"ESCALA", M> = {
    TESTE: { receita:0, gasto:0, lucro:0, roas:0 },
    PRE: { receita:0, gasto:0, lucro:0, roas:0 },
    ESCALA: { receita:0, gasto:0, lucro:0, roas:0 },
  };
  const idToName = new Map<string, string>();
  for (const c of mcsRows) { const id = String(c.campaign_id||"").trim(); const n = String(c.campaign_name||"").trim(); if (id && n && !idToName.has(id)) idToName.set(id, n); }
  const receiptToRt = new Map<string, string>();
  for (const rt of rtRows) {
    const rc = String(rt.raw_payload?.p_sub1 || rt.raw_payload?.receipt || rt.raw_payload?.order || "").trim();
    if (!rc) continue;
    const u = String(rt.utm_campaign||"").trim();
    if (u && !receiptToRt.has(rc)) receiptToRt.set(rc, u);
  }

  for (const r of trafficRows) { const f = detectFase(r.campaign_name||""); if (f) fases[f].gasto += Number(r.spend||0); }

  let cbTotal = 0;
  for (const cb of cbRows.filter((c: any) => isPrimaryCb(c.amount_usd))) {
    const amt = Number(cb.amount_brl||0); if (amt <= 0) continue;
    cbTotal += amt;
    const cid = String(cb.aff_sub2||cb.aff_sub3||"").trim();
    const byId = cid ? (idToName.get(cid)||"") : "";
    const byRc = receiptToRt.get(String(cb.receipt||"").trim())||"";
    const f = detectFase(byId) || detectFase(byRc);
    if (f) fases[f].receita += amt;
  }
  if (cbTotal === 0) {
    for (const rt of rtRows) {
      const f = detectFase(rt.utm_campaign||""); if (!f) continue;
      const a = Number(rt.amount||0); if (a<=0) continue;
      fases[f].receita += (rt.currency||"").toUpperCase()==="BRL" ? a : a * usdToBrl;
    }
  }

  for (const k of ["TESTE","PRE","ESCALA"] as const) {
    fases[k].lucro = fases[k].receita - fases[k].gasto;
    fases[k].roas = fases[k].gasto>0 ? fases[k].receita/fases[k].gasto : 0;
  }

  const ranking = (["TESTE","PRE","ESCALA"] as const).map(k => ({ k, l: fases[k].lucro })).sort((a,b)=>b.l-a.l);
  const vencedor = ranking[0].k;
  const label = vencedor==="TESTE" ? "TESTE (1-50-1)" : vencedor==="PRE" ? "PRÉ-ESCALA (1-100-1)" : "ESCALA (1-250-1)";
  const diagnostico = diag(fases.TESTE, fases.PRE, fases.ESCALA);

  const title = `⚔️ Guerra de Fases — ${op.name}`;
  const line = (emo: string, lbl: string, m: M) => `${emo} ${lbl}\n💰 L: R$ ${fmtBRL(m.lucro)}\n📈 ROAS: ${m.roas.toFixed(2)}x\n💵 R: R$ ${fmtBRL(m.receita)}\n🔥 G: R$ ${fmtBRL(m.gasto)}`;
  const body = [
    line("🟡","TESTE (1-50-1)",fases.TESTE), "",
    line("🟠","PRÉ-ESCALA (1-100-1)",fases.PRE), "",
    line("🔴","ESCALA (1-250-1)",fases.ESCALA), "",
    `🏆 ${label}`, `🧠 ${diagnostico}`,
  ].join("\n");

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "guerra_fases", url: "/" });
  await logAutomatedReport(sb, op.id, "guerra-fases", `${title}\n${body}`, { fases, vencedor, diagnostico }, results);

  return { operation_id: op.id, operation: op.name, vencedor, fases, results };
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
      catch (e) { console.error(`[guerra-fases] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-guerra-fases error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
