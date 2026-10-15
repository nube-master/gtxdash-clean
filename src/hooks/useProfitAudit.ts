import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOperationId } from "@/contexts/OperationContext";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

/**
 * useProfitAudit
 * Builds a per-day audit ledger explaining how revenue, spend and profit
 * are computed. Tracks duplicates by receipt / order_id and exposes the
 * exact rules and rounding that produced each daily total.
 */

export interface AuditLineItem {
  source: "cartpanda" | "redtrack" | "clickbank_audit";
  reference: string;        // receipt or order_id (key used for dedup)
  utm_campaign: string;
  status: string;
  raw_amount: number;       // amount as stored
  currency: string;
  amount_brl: number;       // converted to BRL
  included: boolean;        // counted toward final revenue
  reason: string;           // explanation (kept / duplicate / clickbank_excluded etc.)
}

export interface SpendLineItem {
  account_id: string;
  spend: number;
  currency: string;
  source: "traffic_data" | "realtime_safe";
}

export interface ProfitAuditDay {
  date: string;
  // Revenue
  revenueLines: AuditLineItem[];
  revenueIncluded: number;
  revenueExcluded: number;
  duplicatesCount: number;
  // Spend
  spendLines: SpendLineItem[];
  spendTotal: number;
  // Snapshot (authoritative if present)
  snapshot: {
    total_revenue: number;
    total_spend: number;
    total_conversions: number;
    lucro_bruto: number;
    spend_source: string;
    usd_to_brl: number;
  } | null;
  // Computed
  grossProfit: number;
  profitMarginPct: number;
  // Rules
  rules: string[];
  rounding: string;
}

function getTodaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function isClickbankSale(s: any) {
  return (
    s.store === "clickbank" ||
    s.store === "clickbank_ref" ||
    String(s.order_id || "").toLowerCase().includes("clickbank")
  );
}

async function fetchAudit(start: string, end: string, opId: string | null): Promise<ProfitAuditDay[]> {
  // ── 1) CartPanda / sales_data ──
  const sales = await fetchAllPaginated(
    "sales_data",
    "date,order_id,utm_campaign,status,revenue,store,currency",
    (q: any) => {
      let qq = q.gte("date", start).lte("date", end);
      if (opId) qq = qq.eq("operation_id", opId);
      return qq;
    },
    "date",
    false,
  );

  // ── 2) RedTrack events (purchase + upsell) ──
  let rtQuery = supabase
    .from("redtrack_events")
    .select("occurred_at,utm_campaign,event_type,amount,currency,raw_payload,redtrack_id,transaction_id")
    .in("event_type", ["purchase", "upsell"])
    .gte("occurred_at", `${start}T03:00:00Z`)
    .lt("occurred_at", `${endPlusOne(end)}T03:00:00Z`);
  if (opId) rtQuery = rtQuery.eq("operation_id", opId);
  const { data: rtRows = [] } = await rtQuery;

  // ── 3) ClickBank audit (financial truth) ──
  let cbQuery = supabase
    .from("clickbank_audit")
    .select("date,receipt,amount_brl,amount_usd,transaction_type,product_name,aff_sub2")
    .gte("date", start)
    .lte("date", end)
    .eq("transaction_type", "SALE");
  if (opId) cbQuery = cbQuery.eq("operation_id", opId);
  const { data: cbRows = [] } = await cbQuery;

  // ── 4) Traffic spend by account/day ──
  const spendParams: any = { p_start_date: start, p_end_date: end };
  if (opId) spendParams.p_operation_id = opId;
  const { data: spendRows = [] } = await supabase.rpc("get_traffic_spend_by_account" as any, spendParams);

  // ── 5) Daily snapshot (authoritative for past days) ──
  let snapQuery = supabase
    .from("daily_totals_snapshot")
    .select("date,total_revenue,total_spend,total_conversions,lucro_bruto,spend_source,usd_to_brl")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true })
    .order("created_at", { ascending: false });
  snapQuery = opId ? snapQuery.eq("operation_id", opId) : snapQuery.is("operation_id", null);
  const { data: snapshots = [] } = await snapQuery;
  const snapByDate = new Map<string, any>();
  for (const s of snapshots) {
    if (!snapByDate.has(s.date)) snapByDate.set(s.date, s);
  }

  // ── Build per-day audit ──
  const days: Map<string, ProfitAuditDay> = new Map();

  function ensureDay(d: string): ProfitAuditDay {
    if (!days.has(d)) {
      days.set(d, {
        date: d,
        revenueLines: [],
        revenueIncluded: 0,
        revenueExcluded: 0,
        duplicatesCount: 0,
        spendLines: [],
        spendTotal: 0,
        snapshot: snapByDate.get(d) || null,
        grossProfit: 0,
        profitMarginPct: 0,
        rules: [],
        rounding: "Valores monetários armazenados como NUMERIC e exibidos com 2 casas decimais (Intl pt-BR).",
      });
    }
    return days.get(d)!;
  }

  // Dedup tracking: receipt → first occurrence date (so we flag later dupes)
  const seenReceipts = new Map<string, string>();
  const seenOrderIds = new Map<string, string>();

  // CartPanda
  for (const s of sales) {
    if (!s.date) continue;
    const day = ensureDay(s.date);
    const isCB = isClickbankSale(s);
    const orderId = String(s.order_id || "");
    const dupOrder = orderId && seenOrderIds.has(orderId);
    const amountBrl = Number(s.revenue || 0);

    let included = true;
    let reason = "Incluída (CartPanda primária)";

    if (isCB) {
      included = false;
      reason = "Excluída — entrada ClickBank em sales_data (autoridade é clickbank_audit + RedTrack)";
    } else if (s.status !== "approved") {
      included = false;
      reason = `Excluída — status='${s.status}' (apenas approved conta)`;
    } else if (dupOrder) {
      included = false;
      reason = `Duplicada — order_id já visto em ${seenOrderIds.get(orderId)}`;
      day.duplicatesCount += 1;
    } else if (orderId) {
      seenOrderIds.set(orderId, s.date);
    }

    day.revenueLines.push({
      source: "cartpanda",
      reference: orderId || "(sem order_id)",
      utm_campaign: s.utm_campaign || "—",
      status: s.status || "—",
      raw_amount: Number(s.revenue || 0),
      currency: s.currency || "BRL",
      amount_brl: amountBrl,
      included,
      reason,
    });

    if (included) day.revenueIncluded += amountBrl;
    else day.revenueExcluded += amountBrl;
  }

  // RedTrack
  for (const r of rtRows) {
    const dateSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
      .format(new Date(r.occurred_at));
    const day = ensureDay(dateSP);

    const payload = (r?.raw_payload || {}) as any;
    const receipt =
      payload?.p_sub1 ||
      payload?.receipt ||
      payload?.order ||
      r?.transaction_id ||
      r?.redtrack_id ||
      "";
    const refKey = String(receipt);
    const dup = refKey && seenReceipts.has(refKey);
    const amountBrl = Number(r.amount || 0); // já normalizado em BRL pelo trigger fix_redtrack_amount

    let included = true;
    let reason = "Incluída (RedTrack — backup quando CartPanda não capturou)";
    if (dup) {
      included = false;
      reason = `Duplicada — receipt já visto em ${seenReceipts.get(refKey)}`;
      day.duplicatesCount += 1;
    } else if (refKey) {
      seenReceipts.set(refKey, dateSP);
    }

    day.revenueLines.push({
      source: "redtrack",
      reference: refKey || "(sem receipt)",
      utm_campaign: r.utm_campaign || "—",
      status: r.event_type,
      raw_amount: Number(r.amount || 0),
      currency: r.currency || "BRL",
      amount_brl: amountBrl,
      included,
      reason,
    });

    if (included) day.revenueIncluded += amountBrl;
    else day.revenueExcluded += amountBrl;
  }

  // ClickBank audit (mostrar como referência financeira)
  for (const cb of cbRows) {
    if (!cb.date) continue;
    const day = ensureDay(cb.date);
    const refKey = String(cb.receipt || "");
    const dupInRT = refKey && seenReceipts.has(refKey);
    day.revenueLines.push({
      source: "clickbank_audit",
      reference: refKey,
      utm_campaign: cb.aff_sub2 || cb.product_name || "—",
      status: "SALE",
      raw_amount: Number(cb.amount_usd || 0),
      currency: "USD",
      amount_brl: Number(cb.amount_brl || 0),
      included: false,
      reason: dupInRT
        ? "Referência (já contabilizada via RedTrack pelo mesmo receipt)"
        : "Referência financeira ClickBank — não somada para evitar duplicidade",
    });
  }

  // Spend
  for (const sp of spendRows || []) {
    const day = ensureDay(sp.date);
    day.spendLines.push({
      account_id: sp.account_id,
      spend: Number(sp.total_spend || 0),
      currency: "BRL",
      source: "traffic_data",
    });
    day.spendTotal += Number(sp.total_spend || 0);
  }

  // Final calc + rules
  for (const day of days.values()) {
    // Authoritative override: snapshot wins for past days (same as Dashboard)
    const todaySP = getTodaySP();
    const useSnapshot = day.snapshot && day.date < todaySP;

    const finalRevenue = useSnapshot ? Number(day.snapshot!.total_revenue) : day.revenueIncluded;
    const finalSpend = useSnapshot ? Number(day.snapshot!.total_spend) : day.spendTotal;
    day.grossProfit = finalRevenue - finalSpend;
    day.profitMarginPct = finalRevenue > 0 ? (day.grossProfit / finalRevenue) * 100 : 0;

    day.rules = [
      "CartPanda é fonte primária — entradas com store='clickbank' são excluídas.",
      "RedTrack atua como backup — vendas com receipt já visto são marcadas como duplicadas.",
      "ClickBank Audit listada apenas como referência financeira (não somada).",
      "Apenas vendas approved entram no faturamento (pendentes/cancel = excluídas).",
      "Dedup de CartPanda usa order_id; dedup de RedTrack usa p_sub1/receipt/transaction_id.",
      useSnapshot
        ? `Dia fechado: usando daily_totals_snapshot (spend_source=${day.snapshot!.spend_source}).`
        : "Dia em andamento: usando soma ao vivo das fontes brutas.",
      "Spend convertido para BRL pelo edge sync-meta-* usando câmbio diário.",
    ];
  }

  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function endPlusOne(end: string): string {
  const d = new Date(end + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function useProfitAudit() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const opId = useOperationId();
  return useQuery<ProfitAuditDay[]>({
    queryKey: ["profit-audit", start, end, opId],
    queryFn: () => fetchAudit(start, end, opId),
    staleTime: 60_000,
    placeholderData: (prev) => prev ?? [],
  });
}
