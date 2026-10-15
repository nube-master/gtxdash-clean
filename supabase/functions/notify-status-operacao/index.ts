import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { fraseStatusDia, lucroSinalValor } from "../_shared/op-status-frase.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function brDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function brHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()));
}

function replaceVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

const STATUS_POSITIVO = ["Bom começo!", "Boa!", "Parabéns!", "Excelente!", "Ótimo!", "Dia produtivo!", "Histórico!"];
const STATUS_NEGATIVO = ["Atenção!", "Cuidado!", "Monitorar!"];

const FRASES_POSITIVAS = [
  "☀️ O dia começou bem por aqui.",
  "🚀 O tráfego já começou a responder.",
  "💎 Parece que os criativos estão trabalhando.",
  "📈 As primeiras conversões já apareceram.",
  "🔥 As campanhas estão gerando resultado.",
  "📊 Os números estão saudáveis.",
  "💰 O caixa continua crescendo.",
  "🚀 Escala saudável detectada.",
  "🏆 Mais um dia positivo na operação.",
  "🔥 A máquina de tráfego está funcionando.",
  "📈 O algoritmo decidiu colaborar hoje.",
  "💎 Parece que o tráfego trabalhou bem hoje.",
  "🚀 O ritmo da operação continua saudável.",
  "📊 A operação segue performando bem.",
  "💰 Dinheiro entrando na operação.",
];

const FRASES_NEGATIVAS = [
  "⚠️ As campanhas ainda não engrenaram hoje.",
  "📉 O desempenho está abaixo do esperado.",
  "🔥 Algumas campanhas estão queimando orçamento.",
  "⚠️ O tráfego não está convertendo como esperado.",
  "📉 Conversões abaixo da média hoje.",
  "🔥 O dia pede atenção na operação.",
  "⚠️ Vale monitorar as campanhas agora.",
  "📉 O algoritmo não colaborou hoje.",
  "🔥 Orçamento sendo consumido sem retorno.",
];

function pickAvoidingRepeat(items: string[], lastUsed: string | null): string {
  if (items.length <= 1) return items[0];
  const filtered = lastUsed ? items.filter(f => f !== lastUsed) : items;
  const pool = filtered.length > 0 ? filtered : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

function calculateNetProfit(
  revenue: number,
  totalSpend: number,
  spendByAccount: Map<string, number>,
  currencyMap: Map<string, string>,
  variableCosts: any[],
): number {
  let spendBRL = 0;
  for (const [accId, spend] of spendByAccount) {
    if ((currencyMap.get(accId) || "BRL") === "BRL") spendBRL += spend;
  }
  const impostoMeta = spendBRL * 0.1215;

  let aluguelContas = 0;
  for (const vc of variableCosts) {
    if (!vc.is_active || vc.scope !== "specific_account") continue;
    let accountIds: string[] = [];
    try {
      const parsed = JSON.parse(vc.scope_ref || "[]");
      accountIds = Array.isArray(parsed) ? parsed : [vc.scope_ref];
    } catch { accountIds = vc.scope_ref ? [vc.scope_ref] : []; }
    const applicableSpend = accountIds.reduce((s: number, id: string) => s + (spendByAccount.get(id) || 0), 0);
    switch (vc.calc_base) {
      case "pct_spend": aluguelContas += applicableSpend * (vc.percentage / 100); break;
      case "pct_revenue": aluguelContas += revenue * (vc.percentage / 100); break;
      case "fixed_value": aluguelContas += vc.fixed_value / 30; break;
    }
  }

  return (revenue - totalSpend) - impostoMeta - aluguelContas;
}

async function processOperation(
  sb: any,
  supabaseUrl: string,
  serviceKey: string,
  today: string,
  currentHour: number,
  op: { id: string; name: string },
): Promise<any> {
  // Template SCOPED to this operation
  const { data: tplData } = await sb.from("notification_templates")
    .select("*")
    .eq("type", "status_operacao")
    .eq("is_active", true)
    .eq("operation_id", op.id)
    .limit(1)
    .maybeSingle();

  if (!tplData) {
    return { operation_id: op.id, operation: op.name, skipped: "no_active_template" };
  }

  // Revenue / spend SCOPED to this operation
  let totalRevenue = 0;
  let totalSpend = 0;
  let totalSales = 0;
  try {
    const dtUrl = `${supabaseUrl}/functions/v1/dashboard-totals?start=${today}&end=${today}&operation_id=${op.id}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const dtRes = await fetch(dtUrl, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!dtRes.ok) throw new Error(`dashboard-totals ${dtRes.status}`);
    const dtData = await dtRes.json();
    totalRevenue = Number(dtData.totalRevenue || 0);
    totalSpend = Number(dtData.totalSpend || 0);
    totalSales = Number(dtData.totalConversions ?? dtData.totalSales ?? dtData.salesCount ?? 0);
  } catch (err) {
    console.error(`[notify-status-operacao][${op.name}] dashboard-totals failed: ${(err as Error).message}`);
    return { operation_id: op.id, operation: op.name, skipped: "dashboard_totals_failed" };
  }

  // Costs SCOPED to this operation
  const [trafficByAccount, { data: accountRows }, { data: variableCosts }] = await Promise.all([
    sb.rpc("get_traffic_spend_by_account_fast", { p_start_date: today, p_end_date: today, p_operation_id: op.id }).then((r: any) => r).catch(() => ({ data: [], error: null })),
    sb.from("meta_ad_accounts").select("account_id, currency").eq("is_active", true).eq("operation_id", op.id),
    sb.from("variable_costs").select("*").eq("is_active", true).eq("operation_id", op.id),
  ]);

  const spendByAccount = new Map<string, number>();
  if (trafficByAccount?.data) {
    for (const row of trafficByAccount.data) {
      spendByAccount.set(row.account_id, (spendByAccount.get(row.account_id) || 0) + Number(row.total_spend || 0));
    }
  }
  // Fallback: if RPC doesn't accept operation_id, filter by accounts of this op
  if (spendByAccount.size === 0 && (accountRows || []).length) {
    const opAcctIds = new Set((accountRows || []).map((a: any) => a.account_id));
    const { data: fallback } = await sb.rpc("get_traffic_spend_by_account_fast", { p_start_date: today, p_end_date: today });
    for (const row of fallback || []) {
      if (opAcctIds.has(row.account_id)) {
        spendByAccount.set(row.account_id, (spendByAccount.get(row.account_id) || 0) + Number(row.total_spend || 0));
      }
    }
  }

  const rawAccountTotal = Array.from(spendByAccount.values()).reduce((s, v) => s + v, 0);
  if (rawAccountTotal > 0 && totalSpend > 0) {
    const scale = totalSpend / rawAccountTotal;
    if (Math.abs(scale - 1) > 0.001) {
      for (const [k, v] of spendByAccount) spendByAccount.set(k, v * scale);
    }
  }

  const currencyMap = new Map<string, string>();
  for (const a of (accountRows || [])) currencyMap.set(a.account_id, a.currency);

  const netProfit = calculateNetProfit(totalRevenue, totalSpend, spendByAccount, currencyMap, variableCosts || []);

  console.log(`[notify-status-operacao][${op.name}] hour=${currentHour} rev=${totalRevenue.toFixed(2)} spend=${totalSpend.toFixed(2)} net=${netProfit.toFixed(2)}`);

  const isPositive = netProfit >= 0;
  const statusPool = isPositive ? STATUS_POSITIVO : STATUS_NEGATIVO;
  const frasesPool = isPositive ? FRASES_POSITIVAS : FRASES_NEGATIVAS;

  const { data: lastLog } = await sb.from("automated_reports_log")
    .select("metrics")
    .eq("report_type", "status-operacao")
    .eq("operation_id", op.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const lastStatus = (lastLog?.metrics as any)?.chosenStatus || null;
  const lastFrase = (lastLog?.metrics as any)?.chosenFrase || null;

  const chosenStatus = pickAvoidingRepeat(statusPool, lastStatus);
  // Body enxuto: frase única determinística pelo lucro do dia (sem números).
  const chosenFrase = fraseStatusDia(netProfit, totalSales);
  void frasesPool; void lastFrase;

  const lucroDisplay = fmtBRL(Math.abs(netProfit));
  const resultado = isPositive
    ? `A operação já acumulou R$ ${lucroDisplay} de lucro hoje.`
    : `Resultado atual da operação: -R$ ${lucroDisplay}`;

  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cac = totalSales > 0 ? totalSpend / totalSales : 0;

  const lucroPrefixo = netProfit > 0 ? "Lucro" : netProfit < 0 ? "Prejuízo" : "Resultado";

  const vars: Record<string, string> = {
    status: chosenStatus,
    frase: chosenFrase,
    resultado,
    operacao: op.name,
    vendas: String(totalSales),
    faturamento: fmtBRL(totalRevenue),
    investido: fmtBRL(totalSpend),
    lucro: (isPositive ? "" : "-") + lucroDisplay,
    lucro_valor_abs: lucroDisplay,
    lucro_prefixo: lucroPrefixo,
    lucro_sinal_valor: lucroSinalValor(netProfit),
    roas: roas.toFixed(2),
    cac: fmtBRL(cac),
    // Indicadores dinâmicos: só existem quando a operação está no vermelho
    alerta: isPositive ? "" : "⚠️ ",
    prejuizo: isPositive ? "" : `(prejuízo R$ ${lucroDisplay})`,
  };
  const strip = (t: string) => t.replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/[ \t]{2,}/g, " ").trim();
  const title = strip(replaceVars(tplData.title_template, vars));
  // Body: frase de status + valor do dia (lucro/prejuízo/resultado).
  const body = strip(replaceVars(tplData.body_template || "", vars)) ||
    `${chosenFrase} ${lucroPrefixo}: R$ ${lucroDisplay}`;


  // Recipients SCOPED to this operation (template prefs still respected, but only within op)
  const { data: prefs } = await sb.from("recipient_notification_prefs")
    .select("recipient_id").eq("template_id", tplData.id).eq("enabled", true);
  const recipientIds = (prefs || []).map((p: any) => p.recipient_id);

  let recipients: any[] = [];
  if (recipientIds.length > 0) {
    const { data } = await sb.from("notification_recipients")
      .select("*")
      .in("id", recipientIds)
      .eq("is_active", true)
      .eq("operation_id", op.id);
    recipients = data || [];
  } else {
    const { data } = await sb.from("notification_recipients")
      .select("*")
      .eq("is_active", true)
      .eq("operation_id", op.id);
    recipients = data || [];
  }

  const results: any[] = [];
  for (const recipient of recipients) {
    if (!recipient.webhook_url) continue;
    try {
      const pushRes = await fetch(recipient.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text: body }),
      });
      results.push({ recipient: recipient.name, status: pushRes.ok ? "sent" : "error" });
    } catch (err: any) {
      results.push({ recipient: recipient.name, status: "error", error: err.message });
    }
  }

  // Canal PARALELO: Web Push
  await mirrorToWebPush({
    operation_id: op.id,
    notification_type: "status_operacao",
    title,
    body,
    url: "/",
    // push-send reinterpola o template: sem estas vars o body chega vazio
    payload: vars,
  });



  await sb.from("automated_reports_log").insert({
    operation_id: op.id,
    report_type: "status-operacao",
    period_hours: 24,
    report_text: `${title}\n${body}`,
    metrics: { totalSpend, totalRevenue, netProfit, chosenStatus, chosenFrase, hour: currentHour },
    pushcut_status: results.some(r => r.status === "sent") ? "sent" : "skipped",
  });

  return { operation_id: op.id, operation: op.name, netProfit, totalRevenue, totalSpend, chosenStatus, chosenFrase, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const today = brDate();
    const currentHour = brHour();

    // Optional: allow targeting one operation via body { operation_id }
    let onlyOp: string | null = null;
    try {
      const body = await req.clone().json().catch(() => null);
      onlyOp = body?.operation_id || null;
    } catch { /* ignore */ }

    let opsQuery = sb.from("operations").select("id, name").eq("status", "active");
    if (onlyOp) opsQuery = opsQuery.eq("id", onlyOp);
    const { data: ops, error: opsErr } = await opsQuery;
    if (opsErr) throw opsErr;

    const summaries: any[] = [];
    for (const op of ops || []) {
      try {
        summaries.push(await processOperation(sb, supabaseUrl, serviceKey, today, currentHour, op as any));
      } catch (err) {
        console.error(`[notify-status-operacao] op=${op.id} error:`, err);
        summaries.push({ operation_id: op.id, error: (err as Error).message });
      }
    }

    return jsonRes({ success: true, processed: summaries.length, summaries });
  } catch (err) {
    console.error("notify-status-operacao error:", err);
    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
