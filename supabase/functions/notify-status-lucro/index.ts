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

const FRASES_LUCRO = [
  "🚀 A máquina tá imprimindo dinheiro.", "💰 Caixa positivo hoje.",
  "📈 Operação lucrativa.", "🧠 O algoritmo colaborou hoje.",
  "🔥 Dia forte na operação.", "🏆 Mais um dia no verde.",
  "💎 A máquina de tráfego funcionou.", "💸 Dinheiro pingando na conta.",
  "😎 Dia bonito de ver.", "📊 Lucro confirmado.",
  "🚀 Escala saudável hoje.", "🟢 Operação no verde.",
];
const FRASES_NEUTRO = [
  "⚖️ Empate técnico hoje.", "📊 Operação zerada.",
  "🧠 Dia neutro na operação.", "⏳ Nem lucro nem prejuízo.",
  "🤝 Dia equilibrado.",
];
const FRASES_PREJUIZO = [
  "🚨 Hoje o algoritmo não ajudou.", "📉 Dia vermelho na operação.",
  "⚠️ Hora de revisar campanhas.", "🔥 Dinheiro queimando hoje.",
  "🚨 Operação no vermelho.",
];

function pickAvoidingRepeat(arr: string[], last: string | null): string {
  if (arr.length <= 1) return arr[0];
  const pool = last ? arr.filter((f) => f !== last) : arr;
  const src = pool.length ? pool : arr;
  return src[Math.floor(Math.random() * src.length)];
}

function calcNetProfit(
  revenue: number, totalSpend: number,
  spendByAccount: Map<string, number>, currencyMap: Map<string, string>,
  variableCosts: any[], teamMembers: any[], fixedCosts: any[],
): number {
  let spendBRL = 0, spendUSD = 0;
  for (const [id, sp] of spendByAccount) {
    if ((currencyMap.get(id) || "BRL") === "BRL") spendBRL += sp; else spendUSD += sp;
  }
  const gross = revenue - totalSpend;
  let vc = 0;
  for (const c of variableCosts) {
    if (!c.is_active) continue;
    let ap = totalSpend;
    if (c.scope === "brl_only") ap = spendBRL;
    else if (c.scope === "usd_only") ap = spendUSD;
    else if (c.scope === "specific_account" && c.scope_ref) {
      let ids: string[] = [];
      try { const p = JSON.parse(c.scope_ref); ids = Array.isArray(p) ? p : [c.scope_ref]; }
      catch { ids = [c.scope_ref]; }
      ap = ids.reduce((s: number, i: string) => s + (spendByAccount.get(i) || 0), 0);
    }
    let v = 0;
    switch (c.calc_base) {
      case "pct_spend": v = ap * (c.percentage / 100); break;
      case "pct_revenue": v = revenue * (c.percentage / 100); break;
      case "pct_profit": v = gross * (c.percentage / 100); break;
      case "fixed_value": v = c.fixed_value / 30; break;
    }
    vc += v;
  }
  let cm = 0;
  const beforeCm = revenue - totalSpend - vc;
  for (const t of teamMembers) {
    if (!t.is_active) continue;
    let v = 0;
    switch (t.commission_type) {
      case "pct_profit": v = beforeCm * (t.percentage / 100); break;
      case "pct_gross_profit": v = gross * (t.percentage / 100); break;
      case "pct_revenue": case "pct_creative_revenue": v = revenue * (t.percentage / 100); break;
      case "pct_spend": v = totalSpend * (t.percentage / 100); break;
      case "fixed_salary": v = t.fixed_value / 30; break;
      case "fixed_period": v = t.fixed_value; break;
    }
    cm += v;
  }
  let fc = 0;
  for (const c of fixedCosts) if (c.is_active) fc += c.monthly_value / 30;
  return revenue - totalSpend - vc - cm - fc;
}

async function processOperation(sb: any, supabaseUrl: string, serviceKey: string, today: string, op: { id: string; name: string }) {
  const tpl = await fetchOpTemplate(sb, op.id, "status_lucro_diario");
  if (!tpl) return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };

  // Revenue/spend scoped to this op via dashboard-totals
  let totalRevenue = 0, totalSpend = 0;
  try {
    const url = `${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&operation_id=${op.id}`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }, signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error(`dashboard-totals ${res.status}`);
    const dt = await res.json();
    totalRevenue = Number(dt.totalRevenue || 0);
    totalSpend = Number(dt.totalSpend || 0);
  } catch (e) {
    console.error(`[notify-status-lucro][${op.name}] dashboard-totals failed:`, (e as Error).message);
    return { operation_id: op.id, operation: op.name, skipped: "dashboard_totals_failed" };
  }

  const [{ data: accountRows }, { data: variableCosts }, { data: teamMembers }, { data: fixedCosts }] = await Promise.all([
    sb.from("meta_ad_accounts").select("account_id, currency").eq("is_active", true).eq("operation_id", op.id),
    sb.from("variable_costs").select("*").eq("is_active", true).eq("operation_id", op.id),
    sb.from("team_members").select("*").eq("is_active", true).eq("operation_id", op.id),
    sb.from("fixed_costs").select("*").eq("is_active", true).eq("operation_id", op.id),
  ]);

  // Spend per account (filtered to op's accounts)
  const opAccountIds = new Set((accountRows || []).map((a: any) => a.account_id));
  const spendByAccount = new Map<string, number>();
  if (opAccountIds.size > 0) {
    const { data: rpc } = await sb.rpc("get_traffic_spend_by_account_fast", { p_start_date: today, p_end_date: today });
    for (const r of (rpc || [])) {
      if (opAccountIds.has(r.account_id)) {
        spendByAccount.set(r.account_id, (spendByAccount.get(r.account_id) || 0) + Number(r.total_spend || 0));
      }
    }
  }
  const raw = Array.from(spendByAccount.values()).reduce((s, v) => s + v, 0);
  if (raw > 0 && totalSpend > 0) {
    const scale = totalSpend / raw;
    if (Math.abs(scale - 1) > 0.001) for (const [k, v] of spendByAccount) spendByAccount.set(k, v * scale);
  }
  const currencyMap = new Map<string, string>();
  for (const a of (accountRows || [])) currencyMap.set(a.account_id, a.currency);

  const netProfit = calcNetProfit(totalRevenue, totalSpend, spendByAccount, currencyMap,
    variableCosts || [], teamMembers || [], fixedCosts || []);
  const grossProfit = totalRevenue - totalSpend;

  console.log(`[notify-status-lucro][${op.name}] rev=${totalRevenue.toFixed(2)} spend=${totalSpend.toFixed(2)} net=${netProfit.toFixed(2)}`);

  const neutral = totalRevenue * 0.05;
  let state: "profit" | "neutral" | "loss";
  let pool: string[];
  if (netProfit > neutral) { state = "profit"; pool = FRASES_LUCRO; }
  else if (netProfit >= -neutral) { state = "neutral"; pool = FRASES_NEUTRO; }
  else { state = "loss"; pool = FRASES_PREJUIZO; }

  const { data: lastLog } = await sb.from("automated_reports_log")
    .select("metrics").eq("report_type", "status-lucro-diario").eq("operation_id", op.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const chosenFrase = pickAvoidingRepeat(pool, (lastLog?.metrics as any)?.chosenFrase || null);

  const vars: Record<string, string> = {
    frase: chosenFrase,
    resultado_label: netProfit >= 0 ? "Lucro do dia" : "Prejuízo do dia",
    lucro: fmtBRL(Math.abs(netProfit)),
    operacao: op.name,
  };
  const title = replaceVars(tpl.title_template, vars);
  const body = replaceVars(tpl.body_template, vars);

  const recipients = await fetchOpRecipients(sb, op.id, tpl.id);
  const results = await sendToRecipients(recipients, title, body, { operation_id: op.id, notification_type: "status_lucro_diario", url: "/" });
  await logAutomatedReport(sb, op.id, "status-lucro-diario", `${title}\n${body}`,
    { totalSpend, totalRevenue, grossProfit, netProfit, state, chosenFrase }, results);

  return { operation_id: op.id, operation: op.name, state, netProfit, grossProfit, totalRevenue, totalSpend, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const today = brDate();
    const onlyOp = await readOnlyOp(req);
    const ops = await listActiveOperations(sb, onlyOp);

    const summaries: any[] = [];
    for (const op of ops) {
      try { summaries.push(await processOperation(sb, supabaseUrl, serviceKey, today, op)); }
      catch (e) { console.error(`[notify-status-lucro] op=${op.id}:`, e); summaries.push({ operation_id: op.id, error: (e as Error).message }); }
    }
    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-status-lucro error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
