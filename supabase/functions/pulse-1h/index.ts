import { mirrorToWebPush } from "../_shared/push-mirror.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { compactUsdBody, formatNativeUsd } from "../_shared/pulse-usd-format.ts";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ── Helpers ── */
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${m > 0 ? m + "m" : ""}`;
}

/** Get current date/time parts in BRT, DST-safe */
function getBRTComponents(date: Date = new Date()) {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "America/Sao_Paulo" }).format(date);

  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
  const hour = parseInt(fmt({ hour: "numeric", hour12: false }));

  return { dateStr, hour, date };
}

/** Convert a BRT date + hour to a UTC ISO string (DST-safe) */
function brtHourToUTC(dateStr: string, hour: number): string {
  // Build a date string in BRT, then let the TZ engine convert to UTC
  const brtStr = `${dateStr}T${String(hour).padStart(2, "0")}:00:00`;
  // Use Intl to find the UTC offset at this specific BRT moment
  const brtDate = new Date(brtStr + "Z"); // temporary anchor
  
  // Get the actual UTC offset for this BRT moment by comparing formatted outputs
  const testDate = new Date(`${dateStr}T12:00:00Z`); // midday UTC as reference
  const utcHour = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "UTC" }).format(testDate)
  );
  const brtHour = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(testDate)
  );
  const offsetHours = utcHour - brtHour; // positive = UTC is ahead of BRT (typically 3)
  
  // Apply offset: BRT hour + offset = UTC hour
  const utcTarget = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`);
  utcTarget.setHours(utcTarget.getHours() + offsetHours);
  return utcTarget.toISOString();
}

/* ── Paginated fetch ── */
async function fetchAll(sb: any, table: string, query: (q: any) => any): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let q = sb.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    q = query(q);
    const { data, error } = await q;
    if (error) throw error;
    allData = allData.concat(data || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return allData;
}

/* ── Dedup helpers (portados do dashboard-totals) ── */
function normalizeCampaignKey(utm: string | null | undefined): string {
  if (!utm) return "";
  return utm.toLowerCase().trim().replace(/\|[\d]+$/, "");
}
function normalizeSaleIdentifier(value: any): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "null" || raw === "undefined") return "";
  return raw.startsWith("rt:") ? raw.slice(3) : raw;
}
function saleIdentifierCandidates(...values: any[]): string[] {
  const ids = new Set<string>();
  for (const v of values) {
    const id = normalizeSaleIdentifier(v);
    if (id) ids.add(id);
  }
  return [...ids];
}
function detectRtPlatform(offerName: any, productName?: any): string {
  const segments = String(offerName || "").split("|").map((s) => s.trim().toLowerCase());
  const platformSeg = segments[1] || "";
  if (platformSeg.includes("clickbank")) return "clickbank";
  if (platformSeg.includes("cartpanda")) return "cartpanda";
  if (platformSeg.includes("buygoods")) return "buygoods";
  if (platformSeg.includes("digistore")) return "digistore";
  if (/telemed/i.test(String(offerName || "")) || /telemed/i.test(String(productName || ""))) return "telemed";
  return "other";
}

/* ── Project detection ── */
const PROJECT_PATTERNS: { code: string; regex: RegExp }[] = [
  { code: "NDM", regex: /\[NDM\]|\[MEMO\]|\[NDN\]/i },
  { code: "NDR", regex: /\[NDR\]/i },
  { code: "LDR", regex: /\[LDG\]|\[LDR\]/i },
  { code: "NDB", regex: /\[NEURO\]|\[NDB\]|\[ND\]/i },
];

function detectProject(utmCampaign?: string | null, campaignName?: string | null, store?: string | null): string {
  const text = `${utmCampaign || ""} ${campaignName || ""}`;
  for (const p of PROJECT_PATTERNS) {
    if (p.regex.test(text)) return p.code;
  }
  const s = (store || "").toLowerCase();
  if (s === "ldg") return "LDR";
  if (s === "ndm" || s === "principal") return "NDM";
  if (s === "ndr") return "NDR";
  return "SEM PROJETO";
}

/* ── Status rules ── */
function getStatus(minutesSinceLastSale: number): { label: string; emoji: string } {
  if (minutesSinceLastSale <= 10) return { label: "AQUECIDO", emoji: "🟢" };
  if (minutesSinceLastSale <= 30) return { label: "LENTO", emoji: "🟡" };
  if (minutesSinceLastSale <= 40) return { label: "RISCO", emoji: "🟠" };
  return { label: "CRÍTICO", emoji: "🔴" };
}

/* ── Interfaces ── */
interface MergedSale {
  revenue: number;
  timestamp: string;
  project: string;
  upsell?: boolean;
}

interface TrafficAgg {
  spend: number;
  clicks: number;
  impressions: number;
}

interface ScopeMetrics {
  code: string;
  vendas1h: number;
  receita1h: number;
  inv1h: number;
  lucro1h: number;
  roas1h: number;
  cpa1h: number;
  ctr1h: number;
  vendasHoje: number;
  receitaHoje: number;
  invHoje: number;
  lucroHoje: number;
  roasHoje: number;
  minutesSinceLastSale: number;
}

/* ── Validation result ── */
interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

/* ── Template variable replacement ── */
function replaceVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    let requestBody: any = {};
    try {
      requestBody = req.method === "GET" ? {} : await req.json();
    } catch { /* body optional */ }
    const dryRun = requestBody?.dry_run === true || requestBody?.dryRun === true;
    const onlyOperationId = String(requestBody?.operation_id || requestBody?.operationId || "").trim();

    // ── Resolve ALL active operations (loop below runs report per operation) ──
    let activeOps: { id: string; name: string | null }[] = [];
    try {
      let opsQuery = sb
        .from("operations")
        .select("id, name")
        .eq("status", "active");
      if (onlyOperationId) opsQuery = opsQuery.eq("id", onlyOperationId);
      const { data: ops } = await opsQuery.order("created_at", { ascending: true });
      activeOps = ops || [];
    } catch { /* empty */ }
    if (activeOps.length === 0) {
      return jsonRes({ skipped: true, reason: "no_active_operations" });
    }


    // RECOVERY MODE guard
    try {
      const { data: rm } = await sb.from("app_settings").select("value").eq("key", "recovery_mode").maybeSingle();
      if (rm?.value === true) {
        return jsonRes({ skipped: true, reason: "recovery_mode" });
      }
    } catch { /* proceed */ }

    // ── Aggregated response across all operations ──
    const perOpOutput: any[] = [];

    // ─────────────── LOOP: one full report per active operation ───────────────
    for (const __op of activeOps) {
      const primaryOperationId: string = __op.id;
      console.log(`[pulse-1h] ===== Operation ${__op.name || primaryOperationId} (${primaryOperationId}) =====`);
      // Operações cujo relatório de 1h sai direto do RedTrack, em dólar nativo
      // (ROY GROUP + FAHTO). Ver mem://integrations/redtrack/fahto-mixed-currency.
      const rtNativeMode =
        primaryOperationId === "72951a45-5fa5-4cea-841e-6ec26fdf25a3" ||
        primaryOperationId === "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";


    const now = new Date();
    const { dateStr: todayBRT, hour: currentHourBRT } = getBRTComponents(now);
    const isMidnight = currentHourBRT === 0;

    // ── REGRA 1: Sempre usar a hora FECHADA anterior ──
    // Se agora são 11:17, reportamos 10:00-10:59
    // Se meia-noite (00:xx), reportamos 23:00-23:59 de ontem
    let reportDate: string;
    let effectiveHour: number;

    if (isMidnight) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      reportDate = getBRTComponents(yesterday).dateStr;
      effectiveHour = 23;
    } else {
      reportDate = todayBRT;
      effectiveHour = currentHourBRT - 1;
    }

    // ── REGRA 2: Conversão DST-safe para UTC ──
    const hourStartUTC = brtHourToUTC(reportDate, effectiveHour);
    const hourEndDate = new Date(hourStartUTC);
    hourEndDate.setMinutes(59, 59, 999);
    const hourEndUTC = hourEndDate.toISOString();

    // Início do dia BRT em UTC (00:00 BRT)
    const dayStartUTC = brtHourToUTC(reportDate, 0);

    const windowLabel = `${String(effectiveHour).padStart(2, "0")}:00–${String(effectiveHour).padStart(2, "0")}:59`;

    console.log(`Pulse: op=${primaryOperationId}, currentHour=${currentHourBRT}, reportDate=${reportDate}, effectiveHour=${effectiveHour}, window=${windowLabel}, UTC=${hourStartUTC} → ${hourEndUTC}`);

    // ── Fetch USD→BRL rate ──
    let usdToBrlRate = 5.15;
    try {
      const apis = [
        { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", extract: (d: any) => d.usd?.brl },
        { url: "https://open.er-api.com/v6/latest/USD", extract: (d: any) => d.rates?.BRL },
      ];
      for (const api of apis) {
        try {
          const rateRes = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
          if (!rateRes.ok) continue;
          const rateData = await rateRes.json();
          const rate = api.extract(rateData);
          if (rate && !isNaN(rate) && rate > 0) { usdToBrlRate = rate; break; }
        } catch (_e) { /* try next */ }
      }
    } catch (_e) { /* use default */ }

    // O sync-meta-hourly tem cron próprio. Esperá-lo aqui fazia o loop multi-op
    // estourar o tempo após a primeira operação (FAHTO), impedindo GTX/EDD/SPACE.

    // Re-checar freshness (informativo)
    const { data: latestHourly } = await sb
      .from("traffic_data_hourly")
      .select("updated_at")
      .eq("date", reportDate)
      .eq("hour", effectiveHour)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let dataFreshnessOk = true;
    let freshnessReason = "";
    if (latestHourly?.updated_at) {
      const lastUpdate = new Date(latestHourly.updated_at);
      const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 60000;
      console.log(`[pulse-1h] Dados da hora ${effectiveHour} atualizados há ${minutesSinceUpdate.toFixed(1)}min`);
    }

    // ── Helper: compute date ± N days ──
    function addDays(dateStr: string, n: number): string {
      const d = new Date(dateStr + "T12:00:00Z");
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    }

    // ── Fetch all data in parallel ──
    // Hourly data needs ±1 day to catch timezone offsets from non-BRT accounts
    const hourlyDateFrom = addDays(reportDate, -1);
    const hourlyDateTo = addDays(reportDate, 1);

    // ── All queries MUST filter by operation_id to avoid cross-operation data contamination ──
    const opFilter = primaryOperationId;

    const [salesData, redtrackData, trafficData, hourlyData, accounts, spendRpc, cbAuditData, newsbreakData, dashboardTotals, templates, recipients, prefs] = await Promise.all([
      fetchAll(sb, "sales_data", (q: any) => {
        let query = q.select("revenue, status, created_at, utm_campaign, store, order_id")
          .gte("date", reportDate).lte("date", reportDate).eq("status", "approved");
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      fetchAll(sb, "redtrack_conversions", (q: any) => {
        let query = q.select("payout_brl, conv_time, track_time, rt_campaign, offer, clickid, external_id, raw_payload")
          .gte("conv_time", dayStartUTC).eq("type", "Purchase").eq("status", "approved").gt("payout_brl", 0);
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      fetchAll(sb, "traffic_data", (q: any) => {
        let query = q.select("spend:spend_brl, clicks, impressions, campaign_name, account_id")
          .gte("date", reportDate).lte("date", reportDate);
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      fetchAll(sb, "traffic_data_hourly", (q: any) => {
        let query = q.select("spend:spend_brl, clicks, impressions, date, hour, account_id")
          .gte("date", hourlyDateFrom).lte("date", hourlyDateTo);
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      fetchAll(sb, "meta_ad_accounts", (q: any) => {
        let query = q.select("account_id, timezone, currency").eq("is_active", true);
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      sb.rpc("get_spend_normalized_sp", {
        p_start_date: reportDate,
        p_end_date: reportDate,
        p_operation_id: opFilter || undefined,
      }).then((r: any) => {
        const rows = r.data || [];
        return { data: { total_spend: rows.length > 0 ? rows[0].total_spend : 0 }, error: r.error };
      }),
      // ── BUG 2 FIX: ClickBank audit é a fonte autoritativa para vendas CB (dashboard-totals parity) ──
      fetchAll(sb, "clickbank_audit", (q: any) => {
        let query = q.select("receipt, amount_brl, amount_usd, transaction_type")
          .eq("date", reportDate)
          .eq("transaction_type", "SALE")
          .in("amount_usd", [230, 235, 240]);
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      // ── BUG 1 FIX: Newsbreak spend (USD) ──
      fetchAll(sb, "newsbreak_traffic_data", (q: any) => {
        let query = q.select("spend, date").eq("date", reportDate);
        if (opFilter) query = query.eq("operation_id", opFilter);
        return query;
      }),
      // ── BUG 3 FIX: dashboard-totals como referência autoritativa para sanity check ──
      sb.functions.invoke("dashboard-totals", {
        body: { start: reportDate, end: reportDate, operation_id: opFilter || undefined },
      }).then((r: any) => r.data || null).catch(() => null),
      sb.from("notification_templates")
        .select("id, name, type, title_template, body_template, available_variables, project_scope, is_active, operation_id")
        .eq("type", "pulse_1h")
        .eq("is_active", true)
        .or(`operation_id.eq.${primaryOperationId},operation_id.is.null`)
        .then((r: any) => r.data || []),
      sb.from("notification_recipients")
        .select("id, name, webhook_url, is_active, project_filter, schedule, operation_id")
        .eq("is_active", true)
        .or(`operation_id.eq.${primaryOperationId},operation_id.is.null`)
        .then((r: any) => r.data || []),
      sb.from("recipient_notification_prefs")
        .select("recipient_id, template_id, enabled, schedule")
        .eq("enabled", true)
        .then((r: any) => r.data || []),

    ]);

    // Operações ativas sem template configurado ainda recebem o relatório geral.
    if (templates.length === 0) {
      const opLabel = (__op.name || "OPERAÇÃO").replace(/\s*[🇦-🇿]{2}\s*$/u, "").trim();
      templates.push({
        id: `fallback-${primaryOperationId}`,
        name: "Pulse 1H Geral (fallback)",
        type: "pulse_1h",
        title_template: `${opLabel} | RELATÓRIO ({{janela}})`,
        body_template: "Vendas: {{vendas_1h}} vendas\nFaturamento: R$ {{receita_1h}}\nROAS: {{roas_1h}}\nLucro: R$ {{lucro_1h}}\nInvestido: R$ {{investido_1h}}\nCPA: R$ {{cpa_1h}}",
        available_variables: [],
        project_scope: "TODOS",
        is_active: true,
        operation_id: primaryOperationId,
      });
    }

    // Build account timezone map
    const accountTzMap = new Map<string, string>();
    for (const a of accounts) {
      accountTzMap.set(a.account_id, a.timezone || "America/Sao_Paulo");
    }

    console.log(`Fetched: ${salesData.length} sales, ${redtrackData.length} redtrack, ${trafficData.length} traffic, ${hourlyData.length} hourly, ${accounts.length} accounts, ${templates.length} templates, ${recipients.length} recipients`);

    // ── Authoritative daily spend from RPC ──
    let rpcDailySpend = 0;
    if (!spendRpc.error) {
      rpcDailySpend = Number(spendRpc.data?.total_spend || 0);
    }

    // ── BUG 2 FIX: Dedup model do dashboard-totals (CB audit autoritativo + RT-extra) ──
    // Para cada venda do dia: cp (sales_data não-CB) + cb (clickbank_audit) + rt_extra (RT não em cp e não matching CB receipt)
    const norm = (v: any): string => String(v || "").trim().toLowerCase().replace(/^rt:/, "");

    // Map de receipts CB → revenue BRL (autoritativo)
    const cbReceiptMap = new Map<string, number>();
    for (const c of cbAuditData) {
      const r = norm(c.receipt);
      if (r) cbReceiptMap.set(r, Number(c.amount_brl || 0));
    }

    // Conjunto de IDs já presentes em sales_data (oficial) — agora inclui TODOS os candidatos
    const officialSaleIds = new Set<string>();
    const officialCpCountByKey = new Map<string, number>(); // (date||campaignKey) → count
    for (const s of salesData) {
      const oidLower = (s.order_id || "").toLowerCase();
      const isClickbank = oidLower.includes("clickbank") || (s.store || "").toLowerCase() === "clickbank";
      if (isClickbank) continue;
      // Drop rt-mirror cujo receipt já está em CB audit
      const rtReceiptId = oidLower.startsWith("rt:") ? normalizeSaleIdentifier(s.order_id) : "";
      const isRtCbDup = !!rtReceiptId && cbReceiptMap.has(rtReceiptId);
      if (isRtCbDup) continue;
      // Registra todos identificadores possíveis dessa venda oficial
      for (const id of saleIdentifierCandidates(s.order_id)) officialSaleIds.add(id);
      // Conta por (data, campanha normalizada) — usa today (single-day function)
      const key = `${reportDate}||${normalizeCampaignKey(s.utm_campaign)}`;
      officialCpCountByKey.set(key, (officialCpCountByKey.get(key) || 0) + 1);
    }

    // CP sales (sales_data não-CB e não rt-mirror-de-CB) — entram com timestamp created_at
    const cpSales: MergedSale[] = [];
    for (const s of salesData) {
      const oidLower = (s.order_id || "").toLowerCase();
      const oid = normalizeSaleIdentifier(s.order_id);
      const isClickbank = oidLower.includes("clickbank") || (s.store || "").toLowerCase() === "clickbank";
      const isRtCbDup = !!oid && cbReceiptMap.has(oid);
      if (isClickbank || isRtCbDup) continue;
      cpSales.push({
        revenue: Number(s.revenue),
        timestamp: s.created_at,
        project: detectProject(s.utm_campaign, null, s.store),
      });
    }

    // CB+RT_extra: itera RT events com timestamp; aplica AS 2 REGRAS DO DASHBOARD-TOTALS
    const cbRtSales: MergedSale[] = [];
    const cbReceiptsSeen = new Set<string>();
    const rtNonCbUsedByKey = new Map<string, number>(); // limita RT-CartPanda/BuyGoods/Digistore ao gap vs sales_data
    for (const e of redtrackData) {
      const payload = e?.raw_payload || {};
      const amount = Number(e.payout_brl || 0);
      if (amount <= 0) continue;

      // ── REGRA 2: Drop RT sem ID forte (manual/ghost/AUTO Reconcile) ──
      const hasIdentifier = !!(
        e.clickid || e.external_id ||
        payload.p_sub1 || payload.receipt || payload.order ||
        payload.sub_id || payload.payout_default
      );
      if (!hasIdentifier) continue;

      const ids = saleIdentifierCandidates(
        e.clickid, e.external_id,
        payload.p_sub1, payload.receipt, payload.order,
        payload.deduplicate_token, payload.sub_id,
      );
      const receiptStr = normalizeSaleIdentifier(payload.p_sub1 || payload.receipt || payload.order);
      const platform = detectRtPlatform(e.offer, payload.product_name);
      const isCpOrBgOrDs = platform === "cartpanda" || platform === "buygoods" || platform === "digistore";

      // Match com CB audit → usa revenue autoritativo (deduplica receipt)
      let matchedCbReceipt = false;
      let revBrl = 0;
      if (receiptStr && cbReceiptMap.has(receiptStr)) {
        if (cbReceiptsSeen.has(receiptStr)) continue;
        cbReceiptsSeen.add(receiptStr);
        revBrl = cbReceiptMap.get(receiptStr)!;
        matchedCbReceipt = true;
        cbRtSales.push({
          revenue: revBrl,
          timestamp: e.track_time || e.conv_time,
          project: detectProject(e.rt_campaign, null, e.offer),
        });
        continue;
      }

      // ── REGRA 1: officialCpCountByKey ──
      // Se RT já está em sales_data oficial (qualquer ID bate) → pula (já contado em cpSales)
      const alreadyInOfficial = ids.some((id) => officialSaleIds.has(id));
      if (alreadyInOfficial) continue;

      // Se é RT-CartPanda/BuyGoods/Digistore: só aceita extras ATÉ o oficial CP do mesmo (data, campanha)
      // (qualquer RT além disso é considerado duplicata do checkout autoritativo)
      const key = `${reportDate}||${normalizeCampaignKey(e.rt_campaign)}`;
      const officialCount = officialCpCountByKey.get(key) || 0;
      const usedCount = rtNonCbUsedByKey.get(key) || 0;
      if (isCpOrBgOrDs) {
        rtNonCbUsedByKey.set(key, usedCount + 1);
        if (usedCount + 1 <= officialCount) continue; // já coberto pelo checkout oficial
      }

      // Extra real (RT preenchendo gap de IPN): conta como venda
      revBrl = amount;
      cbRtSales.push({
        revenue: revBrl,
        timestamp: e.track_time || e.conv_time,
        project: detectProject(e.rt_campaign, null, e.offer),
      });
    }

    // Adicionar receipts CB que NÃO apareceram em RT ainda (RT lag) — usa timestamp do início do dia
    const cbOrphanSales: MergedSale[] = [];
    for (const c of cbAuditData) {
      const r = normalizeSaleIdentifier(c.receipt);
      if (!r || cbReceiptsSeen.has(r) || officialSaleIds.has(r)) continue;
      cbOrphanSales.push({
        revenue: Number(c.amount_brl || 0),
        timestamp: dayStartUTC,
        project: "SEM PROJETO",
      });
    }

    const allSales: MergedSale[] = [...cpSales, ...cbRtSales, ...cbOrphanSales];

    // ── GTX: receita autoritativa = cod_orders (Fahto/Sphere), igual dashboard-totals ──
    // RedTrack está em standby na GTX; sales_data/CB não existem. Sem isso o relatório
    // 12h vinha com 0 vendas / R$ 0,00 mesmo com pedidos caindo normalmente.
    const GTX_OP_ID = "0b758a2b-1b92-4769-b47b-416c567e320d";
    if (primaryOperationId === GTX_OP_ID) {
      const codRows = await fetchAll(sb, "cod_orders", (q: any) =>
        q.select("commission_value_brl, status, order_date, created_at, approved_at")
          .eq("operation_id", primaryOperationId)
          .eq("order_date", reportDate)
          .not("status", "in", "(cancelled,expired,refunded)"),
      );
      for (const c of codRows) {
        allSales.push({
          revenue: Number(c.commission_value_brl || 0),
          timestamp: c.approved_at || c.created_at || dayStartUTC,
          project: "SEM PROJETO",
        });
      }
      console.log(`[pulse-1h][GTX] cod_orders ${reportDate}: ${codRows.length} pedidos, R$ ${codRows.reduce((s: number, c: any) => s + Number(c.commission_value_brl || 0), 0).toFixed(2)}`);
    }

    // ── ROY GROUP: upsells somam no faturamento (igual dashboard-totals), mas não contam como venda ──
    const ROY_OP_ID = "72951a45-5fa5-4cea-841e-6ec26fdf25a3";
    if (primaryOperationId === ROY_OP_ID) {
      const { data: fx } = await sb.from("exchange_rate_log").select("rate")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const usdToBrl = Number(fx?.rate) > 0 ? Number(fx?.rate) : 5.30;
      const ups = await fetchAll(sb, "redtrack_events", (q: any) =>
        q.select("amount, currency, occurred_at")
          .eq("operation_id", primaryOperationId)
          .eq("event_type", "upsell")
          .gte("occurred_at", `${reportDate}T00:00:00-03:00`)
          .lte("occurred_at", `${reportDate}T23:59:59-03:00`),
      );
      for (const u of ups) {
        const amt = Number(u.amount || 0);
        if (amt <= 0) continue;
        allSales.push({
          revenue: u.currency === "BRL" ? amt : amt * usdToBrl,
          timestamp: u.occurred_at,
          project: "SEM PROJETO",
          upsell: true,
        });
      }
      console.log(`[pulse-1h][ROY] upsells ${reportDate}: ${ups.length}`);
    }

    console.log(`[pulse-1h] Dedup v3 (2-regras): cp=${cpSales.length}, cb_rt=${cbRtSales.length}, cb_orphan=${cbOrphanSales.length}, total=${allSales.length} (cb_audit=${cbAuditData.length}, rt=${redtrackData.length}, sales_data=${salesData.length})`);


    // ── Traffic aggregation (daily) ──
    const trafficByProject = new Map<string, TrafficAgg>();
    const trafficAll: TrafficAgg = { spend: 0, clicks: 0, impressions: 0 };
    for (const t of trafficData) {
      const proj = detectProject(null, t.campaign_name, null);
      const spend = Number(t.spend);
      const clicks = Number(t.clicks);
      const impressions = Number(t.impressions);
      trafficAll.spend += spend;
      trafficAll.clicks += clicks;
      trafficAll.impressions += impressions;
      const existing = trafficByProject.get(proj) || { spend: 0, clicks: 0, impressions: 0 };
      existing.spend += spend;
      existing.clicks += clicks;
      existing.impressions += impressions;
      trafficByProject.set(proj, existing);
    }

    // Override with RPC spend
    const clientSideSpend = trafficAll.spend;
    if (rpcDailySpend > 0) {
      const spendScale = clientSideSpend > 0 ? rpcDailySpend / clientSideSpend : 1;
      trafficAll.spend = rpcDailySpend;
      for (const [k, v] of trafficByProject) {
        v.spend = v.spend * spendScale;
        trafficByProject.set(k, v);
      }
    }

    // ── REGRA 5: Hourly traffic ──
    // IMPORTANTE: sync-meta-hourly JÁ grava `date` e `hour` em horário de Brasília
    // (ver convertLocalHourToBrt). NÃO reconverter aqui — causa dupla conversão
    // e desloca o gasto de contas em LA/Sydney/NY pra hora errada.
    const hourlyWindow: TrafficAgg = { spend: 0, clicks: 0, impressions: 0 };
    let totalHourlySpendBRTToday = 0;
    let hourlyRecordsMatched = 0;

    for (const h of hourlyData) {
      const brtDate = String(h.date);
      const brtHour = Number(h.hour);
      const spend = Number(h.spend);

      if (brtDate === reportDate) {
        totalHourlySpendBRTToday += spend;
      }

      if (brtDate === reportDate && brtHour === effectiveHour) {
        hourlyWindow.spend += spend;
        hourlyWindow.clicks += Number(h.clicks);
        hourlyWindow.impressions += Number(h.impressions);
        hourlyRecordsMatched++;
      }
    }

    const hasHourlyData = hourlyWindow.spend > 0 || hourlyRecordsMatched > 0;

    // ── COMPLETENESS GUARD: detect if hourly data is incomplete ──
    // Compare target hour record count against average of previous completed hours
    const hourlyCountByHour = new Map<number, number>();
    for (const h of hourlyData) {
      const brtDate = String(h.date);
      const brtHour = Number(h.hour);
      if (brtDate === reportDate) {
        hourlyCountByHour.set(brtHour, (hourlyCountByHour.get(brtHour) || 0) + 1);
      }
    }


    // Rolling-window baseline: compare against the LAST 3 completed hours only.
    // Using the whole day's average leaks madrugada spikes (8-11 contas com delivery)
    // into afternoon comparison (3 contas com delivery), producing false positives.
    const completedHours = Array.from(hourlyCountByHour.keys())
      .filter((hr) => hr < effectiveHour)
      .sort((a, b) => b - a); // desc
    const recentHours = completedHours.slice(0, 3);
    let completedHoursSum = 0;
    for (const hr of recentHours) completedHoursSum += hourlyCountByHour.get(hr) || 0;
    const completedHoursCount = recentHours.length;

    const avgRecordsPerHour = completedHoursCount > 0 ? completedHoursSum / completedHoursCount : 0;
    const targetHourRecords = hourlyCountByHour.get(effectiveHour) || 0;
    // Threshold: require ≥50% of recent-window average, with an absolute floor of 1.
    // If the target hour is very early (0-4h), we don't block by record count to allow ramp-up.
    const isEarlyMorning = effectiveHour <= 4;
    const threshold = Math.max(1, Math.floor(avgRecordsPerHour * 0.5));
    // Guard por gasto: hora-alvo com <50% do gasto médio das 3h anteriores = Meta ainda não fechou.
    const spendByHour = new Map<number, number>();
    for (const h of hourlyData) {
      if (String(h.date) === reportDate) spendByHour.set(Number(h.hour), (spendByHour.get(Number(h.hour)) || 0) + Number(h.spend));
    }
    const recentSpendAvg = recentHours.length > 0 ? recentHours.reduce((a: number, hr: number) => a + (spendByHour.get(hr) || 0), 0) / recentHours.length : 0;
    const spendLooksPartial = !isEarlyMorning && recentSpendAvg > 100 && hourlyWindow.spend < recentSpendAvg * 0.5;
    const isHourlyDataComplete = rtNativeMode
      ? true
      : (isEarlyMorning || avgRecordsPerHour === 0 || targetHourRecords >= threshold) &&
        !(spendLooksPartial && Number(requestBody?.partial_retry || 0) < 3);
    // Após 3 tentativas, envia com o gasto que a Meta já mandou (nunca segura o relatório indefinidamente).

    // Adia o envio: re-sincroniza a Meta e reenvia em 4 min (até 3x) em vez de mandar gasto subestimado.
    const retryN = Number(requestBody?.partial_retry || 0);
    if (spendLooksPartial && !rtNativeMode && !dryRun && retryN < 3) {
      console.warn(`[pulse-1h] ${primaryOperationId} hora ${effectiveHour} parcial (${hourlyWindow.spend.toFixed(0)} vs média ${recentSpendAvg.toFixed(0)}) — adiando (retry ${retryN + 1}/3)`);
      const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` };
      // Espera curta (cabe no limite de vida da função, ~150s): antes era 4 min e a função morria antes do retry.
      const p = new Promise((r) => setTimeout(r, 60 * 1000))
        .then(() => fetch(`${supabaseUrl}/functions/v1/sync-meta-hourly`, { method: "POST", headers: hdrs, body: JSON.stringify({ operation_id: primaryOperationId }), signal: AbortSignal.timeout(45000) }).catch(() => null))
        .then(() => new Promise((r) => setTimeout(r, 10 * 1000)))
        .then(() => { console.log(`[pulse-1h] disparando retry ${retryN + 1}/3 para ${primaryOperationId}`); return fetch(`${supabaseUrl}/functions/v1/pulse-1h`, { method: "POST", headers: hdrs, body: JSON.stringify({ operation_id: primaryOperationId, partial_retry: retryN + 1 }), signal: AbortSignal.timeout(15000) }).catch(() => null); })
        .catch((e) => console.error("[pulse-1h] retry falhou", e));
      // @ts-ignore EdgeRuntime existe no runtime
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
      continue;
    }
    const useHourlyData = hasHourlyData && isHourlyDataComplete;

    // Valor oficial da última hora Meta (raw da janela fechada)
    let hourlySpendMeta1h = useHourlyData ? hourlyWindow.spend : 0;

    // ── REALTIME LAG FALLBACK ──
    // Meta hourly buckets podem atrasar 15-60min pra aparecer, principalmente
    // em contas fora de BRT (Sydney/Kiev/HK). Se rpcDailySpend (RT autoritativo)
    // está bem à frente do somatório do traffic_data_hourly de hoje, a diferença
    // é gasto real que ainda não foi bucketizado — atribui à hora atual.
    let realtimeLagAddedBrl = 0;
    const hourlyLagDelta = Math.max(0, rpcDailySpend - totalHourlySpendBRTToday);
    // Só usa o delta se for material (>R$50 e >5% do RT diário) pra evitar
    // ruído de arredondamento nos horários calmos.
    if (
      hourlyLagDelta > 50 &&
      rpcDailySpend > 0 &&
      hourlyLagDelta / rpcDailySpend > 0.05
    ) {
      realtimeLagAddedBrl = hourlyLagDelta;
      hourlySpendMeta1h += realtimeLagAddedBrl;
      console.log(
        `[Pulse] Realtime lag fallback: +R$${realtimeLagAddedBrl.toFixed(2)} ` +
        `(RT diário=R$${rpcDailySpend.toFixed(2)} vs hourly somado=R$${totalHourlySpendBRTToday.toFixed(2)})`,
      );
    }

    const completenessReason = !isHourlyDataComplete
      ? `Dados horários incompletos para ${windowLabel}: ${targetHourRecords} registros vs média últimas 3h ${avgRecordsPerHour.toFixed(1)}.`
      : "";

    // ── BUG 1 FIX: Newsbreak (USD→BRL), com rateio horário pela proporção de Meta ──
    let newsbreakDailyBrl = 0;
    for (const n of newsbreakData) {
      newsbreakDailyBrl += Number(n.spend || 0) * usdToBrlRate;
    }
    let newsbreakHourBrl = 0;
    if (newsbreakDailyBrl > 0) {
      if (totalHourlySpendBRTToday > 0 && hourlySpendMeta1h > 0) {
        newsbreakHourBrl = newsbreakDailyBrl * (hourlySpendMeta1h / totalHourlySpendBRTToday);
      } else {
        newsbreakHourBrl = newsbreakDailyBrl / 24;
      }
    }

    const hourlySpend1h = hourlySpendMeta1h + newsbreakHourBrl;

    console.log(`Pulse: Spend1h Meta=R$${hourlySpendMeta1h.toFixed(2)} + NB=R$${newsbreakHourBrl.toFixed(2)} (NB_dia=R$${newsbreakDailyBrl.toFixed(2)}) = R$${hourlySpend1h.toFixed(2)}`);

    // ── REGRA 8: Cross-validation — comparar investido 1h com proporção do dia ──
    let crossValidationOk = true;
    let crossValidationReason = "";
    const totalDailySpendBrl = rpcDailySpend + newsbreakDailyBrl;
    if (totalDailySpendBrl > 0 && hourlySpend1h > 0) {
      const hourProportion = hourlySpend1h / totalDailySpendBrl;
      if (hourProportion > 0.40) {
        crossValidationReason = `Invest. 1h (R$${fmtBRL(hourlySpend1h)}) = ${(hourProportion * 100).toFixed(1)}% do dia (R$${fmtBRL(totalDailySpendBrl)}) — proporção atípica`;
        console.warn(`Pulse: ${crossValidationReason}`);
      }
    }

    // ── REGRA 9: Cross-Operation Isolation Guard ──
    // Roda queries SEM filtro de operation_id na mesma janela e confere que:
    //  a) o subconjunto scoped desta op bate com o total filtrado (sem drift);
    //  b) existe pelo menos uma outra operação ativa com dados independentes
    //     (garantindo que o filtro está segregando de fato, não devolvendo tudo);
    //  c) nenhuma linha com operation_id NULL foi contabilizada nos KPIs desta op.
    let isolationOk = true;
    const isolationReasons: string[] = [];
    const isolationBreakdown: any = {
      spendByOp: {} as Record<string, number>,
      salesByOp: {} as Record<string, number>,
      nullSpend: 0,
      nullSales: 0,
    };
    try {
      const [ctrlHourly, ctrlSales] = await Promise.all([
        sb.from("traffic_data_hourly")
          .select("operation_id, spend:spend_brl")
          .eq("date", reportDate)
          .eq("hour", effectiveHour),
        sb.from("sales_data")
          .select("operation_id, revenue")
          .eq("date", reportDate)
          .eq("status", "approved"),
      ]);

      const spendMap = new Map<string, number>();
      let nullSpend = 0;
      for (const r of ctrlHourly.data || []) {
        const oid = r.operation_id || "__null__";
        const v = Number(r.spend || 0);
        if (r.operation_id) spendMap.set(oid, (spendMap.get(oid) || 0) + v);
        else nullSpend += v;
      }
      const salesMap = new Map<string, number>();
      let nullSales = 0;
      for (const r of ctrlSales.data || []) {
        if (r.operation_id) salesMap.set(r.operation_id, (salesMap.get(r.operation_id) || 0) + 1);
        else nullSales++;
      }

      for (const op of activeOps) {
        isolationBreakdown.spendByOp[op.id] = Number((spendMap.get(op.id) || 0).toFixed(2));
        isolationBreakdown.salesByOp[op.id] = salesMap.get(op.id) || 0;
      }
      isolationBreakdown.nullSpend = Number(nullSpend.toFixed(2));
      isolationBreakdown.nullSales = nullSales;

      const thisOpRawSpend = spendMap.get(primaryOperationId) || 0;
      const spendDrift = Math.abs(thisOpRawSpend - hourlyWindow.spend);
      const spendTol = Math.max(1, thisOpRawSpend * 0.02);
      if (spendDrift > spendTol) {
        isolationOk = false;
        isolationReasons.push(
          `Spend scoped=R$${fmtBRL(hourlyWindow.spend)} ≠ raw op=${primaryOperationId.slice(0, 8)} R$${fmtBRL(thisOpRawSpend)} (drift R$${fmtBRL(spendDrift)})`,
        );
      }

      const thisOpRawSales = salesMap.get(primaryOperationId) || 0;
      const salesDrift = Math.abs(thisOpRawSales - salesData.length);
      if (salesDrift > Math.max(1, thisOpRawSales * 0.02)) {
        isolationOk = false;
        isolationReasons.push(
          `Sales scoped=${salesData.length} ≠ raw op=${primaryOperationId.slice(0, 8)} ${thisOpRawSales} (drift ${salesDrift})`,
        );
      }

      // Contaminação por linhas sem operation_id (não devem entrar em nenhum relatório)
      if (nullSpend > 10) {
        isolationReasons.push(`Traffic hourly com operation_id NULL: R$${fmtBRL(nullSpend)} (ignorado, precisa backfill)`);
        // não bloqueia — só sinaliza
      }
      if (nullSales > 0) {
        isolationReasons.push(`${nullSales} vendas com operation_id NULL na janela (não contabilizadas)`);
      }

      // Sanity: se há mais de uma op ativa, alguma outra deve ter dados no dia
      const otherOpsHaveData = activeOps
        .filter((o) => o.id !== primaryOperationId)
        .some((o) => (spendMap.get(o.id) || 0) > 0 || (salesMap.get(o.id) || 0) > 0);
      if (activeOps.length > 1 && !otherOpsHaveData && (spendMap.size + salesMap.size) > 0) {
        // Se somente esta op tem dados globais, ok (pode ser realidade).
        // Só alertamos se cross-op breakdown parece impossível.
        console.log("[pulse-1h] Isolation: only current op has data in window — plausível");
      }

      console.log(
        `[pulse-1h] Isolation op=${primaryOperationId.slice(0, 8)} ` +
        `spend scoped=${hourlyWindow.spend.toFixed(2)} raw=${thisOpRawSpend.toFixed(2)} ` +
        `sales scoped=${salesData.length} raw=${thisOpRawSales} ` +
        `— ${isolationOk ? "OK" : "DRIFT"}`,
      );
    } catch (e: any) {
      console.warn("[pulse-1h] Isolation guard failed (não bloqueando):", e?.message);
    }

    // ── Build metrics for a given scope ──
    function buildMetrics(code: string, sales: MergedSale[], traffic: TrafficAgg): ScopeMetrics {
      const sales1h = sales.filter((s) => s.timestamp >= hourStartUTC && s.timestamp <= hourEndUTC);

      const vendasHoje = sales.filter((s) => !s.upsell).length;
      const receitaHoje = sales.reduce((s, v) => s + v.revenue, 0);
      const vendas1h = sales1h.filter((s) => !s.upsell).length;
      const receita1h = sales1h.reduce((s, v) => s + v.revenue, 0);

      // BUG 1 FIX: invHoje no escopo ALL inclui Meta (rpcDailySpend) + Newsbreak
      const invHoje = code === "ALL" ? (rpcDailySpend + newsbreakDailyBrl) : traffic.spend;

      // REGRA 5: Investido 1h = Meta horário + Newsbreak rateado
      let inv1h: number;
      if (code === "ALL") {
        inv1h = hourlySpend1h;
      } else {
        inv1h = 0;
      }

      const lucroHoje = receitaHoje - invHoje;
      const lucro1h = receita1h - inv1h;
      const roasHoje = invHoje > 0 ? receitaHoje / invHoje : 0;
      const roas1h = inv1h > 0 ? receita1h / inv1h : 0;
      const cpa1h = vendas1h > 0 ? inv1h / vendas1h : 0;

      let ctr1h: number;
      if (code === "ALL" && useHourlyData && hourlyWindow.impressions > 0) {
        ctr1h = (hourlyWindow.clicks / hourlyWindow.impressions) * 100;
      } else {
        ctr1h = traffic.impressions > 0 ? (traffic.clicks / traffic.impressions) * 100 : 0;
      }

      let minutesSinceLastSale = 999;
      if (sales.length > 0) {
        const sorted = [...sales].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        minutesSinceLastSale = (now.getTime() - new Date(sorted[0].timestamp).getTime()) / 60000;
      }

      return { code, vendas1h, receita1h, inv1h, lucro1h, roas1h, cpa1h, ctr1h, vendasHoje, receitaHoje, invHoje, lucroHoje, roasHoje, minutesSinceLastSale };
    }

    // ── Pre-compute metrics ──
    const allMetrics = buildMetrics("ALL", allSales, trafficAll);
    const projectCodes = new Set<string>();
    for (const s of allSales) projectCodes.add(s.project);
    for (const [k] of trafficByProject) projectCodes.add(k);
    projectCodes.delete("SEM PROJETO");

    const metricsCache = new Map<string, ScopeMetrics>();
    metricsCache.set("TODOS", allMetrics);
    for (const code of projectCodes) {
      const projSales = allSales.filter((s) => s.project === code);
      const projTraffic = trafficByProject.get(code) || { spend: 0, clicks: 0, impressions: 0 };
      metricsCache.set(code, buildMetrics(code, projSales, projTraffic));
    }

    // ── ROY GROUP + FAHTO: tudo (vendas, faturamento, investimento) direto do RedTrack, em USD ──
    const FAHTO_OP_ID = "8707b3f8-ab41-4a63-902c-9ab97fe50c8a";
    let royRedtrackUsd = false;
    if (rtNativeMode) {
      try {
        const { data: keyRow } = await sb.from("app_settings").select("value")
          .eq("operation_id", primaryOperationId).eq("key", "redtrack_api_key").maybeSingle();
        const rtKey = keyRow?.value ? String(keyRow.value).replace(/^"|"$/g, "") : "";
        if (rtKey) {
          const isFahto = primaryOperationId === FAHTO_OP_ID;
          // FAHTO: agrupa por campanha+hora para filtrar apenas campanhas [META]
          const group = isFahto ? "campaign,hour_of_day" : "hour_of_day";
          const url = `https://api.redtrack.io/report?api_key=${encodeURIComponent(rtKey)}&date_from=${reportDate}&date_to=${reportDate}&group=${group}&timezone=America/Sao_Paulo`;
          const resp = await fetch(url);
          const rowsRaw = resp.ok ? await resp.json() : null;
          if (Array.isArray(rowsRaw)) {
            const rows = isFahto
              ? rowsRaw.filter((r: any) => String(r.campaign || "").toUpperCase().includes("[META]"))
              : rowsRaw;
            const sum = (k: string, filt?: (r: any) => boolean) =>
              rows.filter(filt ?? (() => true)).reduce((s: number, r: any) => s + Number(r[k] || 0), 0);
            const isHour = (r: any) => Number(r.hour_of_day) === effectiveHour;
            const saleKey = isFahto ? "convtype1" : "convtype3";
            const vendasHoje = sum(saleKey);
            const receitaHoje = sum("total_revenue");
            const invHoje = sum("cost");
            const vendas1h = sum(saleKey, isHour);
            const receita1h = sum("total_revenue", isHour);
            const inv1h = sum("cost", isHour);
            const lastSaleMin = allMetrics.minutesSinceLastSale;
            const m: ScopeMetrics = {
              code: "ALL", vendas1h, receita1h, inv1h,
              lucro1h: receita1h - inv1h,
              roas1h: inv1h > 0 ? receita1h / inv1h : 0,
              cpa1h: vendas1h > 0 ? inv1h / vendas1h : 0,
              ctr1h: allMetrics.ctr1h,
              vendasHoje, receitaHoje, invHoje,
              lucroHoje: receitaHoje - invHoje,
              roasHoje: invHoje > 0 ? receitaHoje / invHoje : 0,
              minutesSinceLastSale: lastSaleMin,
            };
            Object.assign(allMetrics, m);
            metricsCache.set("TODOS", allMetrics);
            royRedtrackUsd = true;
            console.log(`[pulse-1h][ROY-RT] hora ${effectiveHour}: ${vendas1h} vendas, $${receita1h.toFixed(2)} fat, $${inv1h.toFixed(2)} gasto | dia: ${vendasHoje} vendas, $${receitaHoje.toFixed(2)} / $${invHoje.toFixed(2)}`);
          }
        }
      } catch (e: any) {
        console.warn("[pulse-1h][ROY-RT] falhou, usando fontes padrão:", e?.message);
      }
    }

    // ── REGRA 4: Validação de consistência ──
    function validateMetrics(m: ScopeMetrics): ValidationResult {
      const reasons: string[] = [];

      // Gasto > 0 mas impressões = 0 → erro de sincronização
      if (m.inv1h > 0 && hourlyWindow.impressions === 0 && m.code === "ALL") {
        reasons.push(`Gasto 1h R$${fmtBRL(m.inv1h)} mas impressões=0 — possível erro de sync`);
      }

      // Vendas > 0 mas faturamento = 0
      if (m.vendas1h > 0 && m.receita1h === 0) {
        reasons.push(`${m.vendas1h} vendas reportadas mas faturamento=R$0,00`);
      }

      // Lucro negativo extremo com gasto muito baixo (possível erro de conversão)
      if (m.lucro1h < -500 && m.inv1h < 50 && m.inv1h > 0) {
        reasons.push(`Lucro extremamente negativo R$${fmtBRL(m.lucro1h)} com gasto baixo R$${fmtBRL(m.inv1h)} — possível erro de conversão`);
      }

      return { valid: reasons.length === 0, reasons };
    }

    // Run global validation
    const globalValidation = validateMetrics(allMetrics);

    // ── Sanity check vs dashboard-totals: AVISA, nunca BLOQUEIA ──
    let divergenceBanner = "";
    const dashRev = royRedtrackUsd ? 0 : Number(dashboardTotals?.totalRevenue || 0);
    const dashSpend = royRedtrackUsd ? 0 : Number(dashboardTotals?.totalSpend || 0);
    const dashConv = royRedtrackUsd ? 0 : Number(dashboardTotals?.totalConversions || 0);

    // Fallback por campo: se o pulse veio zerado e o dash tem valor, usa o dash
    if (allMetrics.receitaHoje === 0 && dashRev > 0) allMetrics.receitaHoje = dashRev;
    if (allMetrics.invHoje === 0 && dashSpend > 0) allMetrics.invHoje = dashSpend;
    if (allMetrics.vendasHoje === 0 && dashConv > 0) allMetrics.vendasHoje = dashConv;

    const drift = (a: number, b: number) => (b > 0 ? Math.abs(a - b) / b : 0);
    const revDrift = drift(allMetrics.receitaHoje, dashRev);
    const spendDrift = drift(allMetrics.invHoje, dashSpend);
    const convDrift = drift(allMetrics.vendasHoje, dashConv);
    let divergenceExceeded = false;

    if (dashRev > 0 || dashSpend > 0) {
      const lines: string[] = [];
      if (revDrift > 0.15) lines.push(`Receita: pulse R$${fmtBRL(allMetrics.receitaHoje)} vs dash R$${fmtBRL(dashRev)} (${(revDrift * 100).toFixed(1)}%)`);
      if (spendDrift > 0.15) lines.push(`Investido: pulse R$${fmtBRL(allMetrics.invHoje)} vs dash R$${fmtBRL(dashSpend)} (${(spendDrift * 100).toFixed(1)}%)`);
      if (convDrift > 0.15) lines.push(`Vendas: pulse ${allMetrics.vendasHoje} vs dash ${dashConv} (${(convDrift * 100).toFixed(1)}%)`);
      if (lines.length > 0) {
        divergenceExceeded = true;
        divergenceBanner = `⚠️ ATENÇÃO: divergência entre fontes\n${lines.join("\n")}\nPossíveis causas: RedTrack em lag, webhook duplicado, sync Meta atrasado.\n\n`;
        console.warn(`Pulse: divergência >15% (não bloqueante): ${lines.join("; ")}`);
      }
    }

    // Auditoria da divergência (sempre, mesmo dentro do limite)
    try {
      await sb.from("pulse_divergence_log").insert({
        operation_id: primaryOperationId ?? null,
        report_date: reportDate,
        hour_brt: currentHourBRT,
        pulse_revenue: allMetrics.receitaHoje,
        dash_revenue: dashRev,
        revenue_drift_pct: Number((revDrift * 100).toFixed(2)),
        pulse_spend: allMetrics.invHoje,
        dash_spend: dashSpend,
        spend_drift_pct: Number((spendDrift * 100).toFixed(2)),
        pulse_sales: allMetrics.vendasHoje,
        dash_sales: dashConv,
        sales_drift_pct: Number((convDrift * 100).toFixed(2)),
        exceeded: divergenceExceeded,
        details: divergenceBanner || null,
      });
    } catch (e) {
      console.warn(`Pulse: falha ao logar divergência: ${(e as Error).message}`);
    }

    // Collect all blocking reasons (divergência NÃO entra aqui)
    const blockReasons: string[] = [];
    if (!dataFreshnessOk) blockReasons.push(freshnessReason);
    // Em modo RedTrack nativo (ROY/FAHTO) o dinheiro vem direto do RedTrack, então a
    // completude dos buckets horários da Meta não deve travar o envio.
    if (!isHourlyDataComplete && completenessReason && !rtNativeMode) blockReasons.push(completenessReason);
    if (!crossValidationOk) blockReasons.push(crossValidationReason);
    if (!globalValidation.valid) blockReasons.push(...globalValidation.reasons);
    if (!isolationOk) blockReasons.push(...isolationReasons.map((r) => `[ISOLATION] ${r}`));


    const shouldSend = blockReasons.length === 0;
    const reportStatus = shouldSend ? "valid" : "inconsistent";

    console.log(`Pulse: validation=${reportStatus}, blockReasons=${JSON.stringify(blockReasons)}`);

    // ── Build recipient → template preference map ──
    const prefsByTemplate = new Map<string, Set<string>>();
    const prefScheduleMap = new Map<string, string[]>();
    for (const p of prefs) {
      if (!p.enabled) continue;
      const set = prefsByTemplate.get(p.template_id) || new Set();
      set.add(p.recipient_id);
      prefsByTemplate.set(p.template_id, set);
      // Store per-template schedule (empty array = sem filtro de hora)
      const prefSched: string[] = Array.isArray(p.schedule) ? p.schedule : [];
      prefScheduleMap.set(`${p.recipient_id}::${p.template_id}`, prefSched);
    }

    const recipientMap = new Map<string, any>();
    for (const r of recipients) {
      recipientMap.set(r.id, r);
    }

    // ── Process each template ──
    const results: { template: string; scope: string; recipient: string; status: string; error?: string }[] = [];
    const notificationTexts: string[] = [];

    for (const tpl of templates) {
      const scope = tpl.project_scope || "TODOS";

      let metrics = metricsCache.get(scope);
      if (!metrics) {
        metrics = buildMetrics(scope, [], { spend: 0, clicks: 0, impressions: 0 });
      }

      const status = getStatus(metrics.minutesSinceLastSale);

      // REGRA EXTRA: Exibir janela analisada no título
      const vars: Record<string, string> = {
        status: `${status.emoji} ${status.label}`,
        vendas_1h: String(metrics.vendas1h),
        receita_1h: fmtBRL(metrics.receita1h),
        roas_1h: metrics.roas1h > 0 ? metrics.roas1h.toFixed(2) : "—",
        lucro_1h: fmtBRL(metrics.lucro1h),
        investido_1h: fmtBRL(metrics.inv1h),
        cpa_1h: metrics.cpa1h > 0 ? fmtBRL(metrics.cpa1h) : "—",
        ctr_1h: metrics.ctr1h > 0 ? `${metrics.ctr1h.toFixed(1)}%` : "—",
        vendas: String(metrics.vendasHoje),
        receita: fmtBRL(metrics.receitaHoje),
        roas: metrics.roasHoje > 0 ? metrics.roasHoje.toFixed(2) : "—",
        lucro: fmtBRL(metrics.lucroHoje),
        investido: fmtBRL(metrics.invHoje),
        cpa: metrics.vendasHoje > 0 ? fmtBRL(metrics.invHoje / metrics.vendasHoje) : "—",
        tempo_sem_venda: fmtDuration(metrics.minutesSinceLastSale),
        projeto: scope === "TODOS" ? "OP GERAL" : scope,
        periodo: isMidnight ? `Resumo Final (${reportDate})` : `Última 1h`,
        janela: windowLabel,
        hora_inicio: `${String(effectiveHour).padStart(2, "0")}:00`,
        hora_fim: `${String(effectiveHour).padStart(2, "0")}:59`,
      };

      // Render title & body — inject window label into title
      let title = replaceVars(tpl.title_template, vars);
      // If title doesn't already contain the window, append it
      if (!title.includes(windowLabel)) {
        title = title.replace(/1H/i, `1H (${windowLabel})`);
      }
    const sourceFooter = royRedtrackUsd && scope === "TODOS"
        ? ""
        : `\n\nFontes: Vendas/Faturamento = RedTrack (pulse) · Investido = Meta Ads (Traffic OS) · ROAS/Lucro/CPA = derivados`;
      if (royRedtrackUsd && scope === "TODOS") {
        for (const k of ["receita_1h","lucro_1h","investido_1h","cpa_1h","receita","lucro","investido","cpa"]) {
          if (vars[k] && vars[k] !== "—") {
            const numeric = Number(vars[k].replace(/\./g, "").replace(",", "."));
            vars[k] = formatNativeUsd(numeric);
          }
        }
        vars.report_currency = "USD";
        vars.report_source = "redtrack";
      }
      const renderedBody = replaceVars(tpl.body_template, vars);
      const reportBody = divergenceBanner + renderedBody + sourceFooter;
      const body = royRedtrackUsd && scope === "TODOS" ? compactUsdBody(reportBody) : reportBody;

      notificationTexts.push(`${title}\n${body}`);

      // REGRA 6: Bloquear envio se inconsistência
      if (!shouldSend) {
        results.push({ template: tpl.name, scope, recipient: "ALL", status: "blocked_inconsistent", error: blockReasons.join("; ") });
        continue;
      }

      // Canal PARALELO: Web Push depende de push_notification_recipients, não
      // das preferências Pushcut. Envia uma vez por operação/template.
      if (!dryRun) {
        await mirrorToWebPush({
          operation_id: tpl.operation_id ?? primaryOperationId,
          notification_type: "pulse_1h",
          title,
          body,
          url: "/",
          payload: vars,
        });
      }

      // Find recipients who have this template enabled
      const enabledRecipients = prefsByTemplate.get(tpl.id) ?? new Set(
        tpl.id.startsWith("fallback-") ? recipients.map((r: any) => r.id as string) : [],
      );
      if (enabledRecipients.size === 0) {
        results.push({ template: tpl.name, scope, recipient: "none", status: "no_recipients" });
        continue;
      }

      const currentHourStr = String(currentHourBRT).padStart(2, "0") + ":00";

      for (const recipientId of enabledRecipients) {
        const recipient = recipientMap.get(recipientId);
        if (!recipient) {
          results.push({ template: tpl.name, scope, recipient: recipientId, status: "recipient_not_found" });
          continue;
        }

        // Pulse 1h: disparo controlado pelo cron (~1h10), sem filtro de horário por template

        const projectFilter: string[] = Array.isArray(recipient.project_filter) ? recipient.project_filter : ["TODOS"];
        const recipientAcceptsScope = projectFilter.includes("TODOS") || projectFilter.includes(scope) || scope === "TODOS";
        if (!recipientAcceptsScope) {
          results.push({ template: tpl.name, scope, recipient: recipient.name, status: "filtered_out" });
          continue;
        }

        if (!recipient.webhook_url) {
          results.push({ template: tpl.name, scope, recipient: recipient.name, status: "no_webhook" });
          continue;
        }

        if (dryRun) {
          results.push({ template: tpl.name, scope, recipient: recipient.name, status: "dry_run" });
          continue;
        }

        try {
          const pushRes = await fetch(recipient.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, text: body }),
          });

          if (pushRes.ok) {
            results.push({ template: tpl.name, scope, recipient: recipient.name, status: "sent" });
          } else {
            const errText = await pushRes.text();
            results.push({ template: tpl.name, scope, recipient: recipient.name, status: "pushcut_error", error: errText });
          }
        } catch (err: any) {
          results.push({ template: tpl.name, scope, recipient: recipient.name, status: "error", error: err.message });
        }
      }

    }


    // ── REGRA 7: Log de auditoria completo ──
    const sentCount = results.filter((r) => r.status === "sent").length;
    const allProjectMetrics = Array.from(metricsCache.entries())
      .filter(([k]) => k !== "TODOS")
      .map(([, v]) => v)
      .sort((a, b) => b.receitaHoje - a.receitaHoje);

    await sb.from("automated_reports_log").insert({
      report_type: "pulse-1h",
      period_hours: 1,
      operation_id: primaryOperationId,
      metrics: {
        all: allMetrics,
        projects: allProjectMetrics,
        hour: currentHourBRT,
        effectiveHour,
        windowLabel,
        today: todayBRT,
        reportDate,
        templates_processed: templates.length,
        notifications_sent: sentCount,
        validation: {
          status: reportStatus,
          blockReasons,
          dataFreshnessOk,
          crossValidationOk,
          crossValidationDetail: crossValidationOk ? null : crossValidationReason,
          globalValidation: globalValidation,
          isolationOk,
          isolationReasons,
          isolationBreakdown,
        },
        debug: {
          salesDataRows: salesData.length,
          redtrackRows: redtrackData.length,
          trafficRows: trafficData.length,
          hourlyRows: hourlyData.length,
          hourlyRecordsMatched,
          hasHourlyData,
          useHourlyData,
          isHourlyDataComplete,
          targetHourRecords,
          avgRecordsPerHour,
          hourlyWindowSpendBRT: hourlyWindow.spend,
          hourlyWindowClicksBRT: hourlyWindow.clicks,
          hourlyWindowImpressionsBRT: hourlyWindow.impressions,
          totalHourlySpendBRTToday,
          hourlySpend1h,
          rpcDailySpend,
          realtimeLagAddedBrl,
          hourlyLagDelta,
          usdToBrlRate,
          accountsCount: accounts.length,
        },
      },
      report_text: shouldSend
        ? notificationTexts.join("\n\n---\n\n")
        : `[BLOQUEADO] ${blockReasons.join("; ")}\n\n---\n\n${notificationTexts.join("\n\n---\n\n")}`,
      pushcut_status: !shouldSend ? "blocked" : (sentCount > 0 ? (sentCount === results.length ? "sent" : "partial") : "skipped"),
    });

    perOpOutput.push({
      operationId: primaryOperationId,
      operationName: __op.name,
      reportStatus,
      blockReasons,
      templates_processed: templates.length,
      notifications_sent: sentCount,
      total_dispatches: results.length,
      results,
      metrics: { all: allMetrics, projects: allProjectMetrics },
    });
    } // ── end loop over active operations ──

    return jsonRes({
      success: true,
      operations_processed: perOpOutput.length,
      operations: perOpOutput,
    });

  } catch (err) {
    console.error("pulse-1h error:", err);

    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      let msg: string;
      if (err instanceof Error) msg = err.message;
      else if (typeof err === "string") msg = err;
      else {
        try { msg = JSON.stringify(err); } catch { msg = String(err); }
      }
      await sb.from("system_logs").insert({
        type: "EDGE_ERROR",
        function_name: "pulse-1h",
        message: msg?.slice(0, 2000) || "unknown error",
        stack: err instanceof Error ? err.stack : null,
      });
    } catch {}

    return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
