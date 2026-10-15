import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { buildCashflowProjection, getCashflowSummary, type PaymentModel, type DailyData, type CashflowAdjustment } from "@/lib/cashflowEngine";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { useExchangeRate } from "@/hooks/useExchangeRate";

type SaleRow = { date: string; revenue: number; status: string; created_at: string; store: string | null; order_id: string };
type RedTrackRow = { occurred_at: string; amount: number; event_type: string; currency: string };

// ── Timezone offset map (hours from UTC) ──
const TZ_OFFSETS: Record<string, number> = {
  "America/Sao_Paulo": -3,
  "America/Los_Angeles": -7, // PDT (ClickBank default)
  "America/New_York": -4,    // EDT
  "UTC": 0,
};

function convertToTzDate(isoTimestamp: string, tz: string): string {
  const d = new Date(isoTimestamp);
  const offset = TZ_OFFSETS[tz] ?? -3;
  // Apply offset: convert UTC to target timezone
  const adjusted = new Date(d.getTime() + offset * 3600_000);
  return adjusted.toISOString().slice(0, 10);
}

// ── Settings ──
export function useCashflowSettings(month: string) {
  return useQuery({
    queryKey: ["cashflow-settings", month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashflow_settings")
        .select("*")
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertCashflowSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      month: string;
      initial_cash: number;
      margin_percent: number;
      projection_roi?: number;
      payment_model: string;
      timezone_venda: string;
      notes?: string;
    }) => {
      const { data: existing } = await supabase
        .from("cashflow_settings")
        .select("id")
        .eq("month", settings.month)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("cashflow_settings")
          .update({ ...settings, updated_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cashflow_settings")
          .insert(settings as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cashflow-settings", vars.month] });
      qc.invalidateQueries({ queryKey: ["cashflow-projection"] });
    },
  });
}

// ── Payment Models ──
export function usePaymentModels() {
  return useQuery({
    queryKey: ["payment-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_models")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as PaymentModel[];
    },
  });
}

// ── Cashflow Projection (connected to real data) ──
export function useCashflowProjection(month: string) {
  const year = parseInt(month.split("-")[0]);
  const monthIdx = parseInt(month.split("-")[1]) - 1;
  const start = format(startOfMonth(new Date(year, monthIdx)), "yyyy-MM-dd");
  const end = format(endOfMonth(new Date(year, monthIdx)), "yyyy-MM-dd");

  // Previous month for spillover receipts AND carry-over balance
  const prevDate = subMonths(new Date(year, monthIdx, 1), 1);
  const prevStart = format(startOfMonth(prevDate), "yyyy-MM-dd");
  const prevEnd = format(endOfMonth(prevDate), "yyyy-MM-dd");

  // Prev-prev month for spillover into prev month computation
  const prevPrevDate = subMonths(new Date(year, monthIdx, 1), 2);
  const prevPrevStart = format(startOfMonth(prevPrevDate), "yyyy-MM-dd");
  const prevPrevEnd = format(endOfMonth(prevPrevDate), "yyyy-MM-dd");

  const usdToBrl = useExchangeRate();
  const settingsQuery = useCashflowSettings(month);
  const prevSettingsQuery = useCashflowSettings(format(prevDate, "yyyy-MM"));
  const modelsQuery = usePaymentModels();

  // ── Real spend data (normalized to SP timezone, same as dashboard) ──
  const spendQuery = useQuery({
    queryKey: ["cashflow-spend", start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_spend_normalized_sp", {
        p_start_date: start,
        p_end_date: end,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  // ── Previous month spend (for carry-over computation) ──
  const prevSpendQuery = useQuery({
    queryKey: ["cashflow-spend-prev", prevStart, prevEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_spend_normalized_sp", {
        p_start_date: prevStart,
        p_end_date: prevEnd,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  // ── Real sales data (from sales_data — excluding clickbank_ref duplicates) ──
  const salesQuery = useQuery({
    queryKey: ["cashflow-sales-real", start, end],
    queryFn: async () => {
      return fetchAllPaginated<SaleRow>(
        "sales_data",
        "date, revenue, status, created_at, store, order_id",
        (q: any) => q.gte("date", start).lte("date", end).eq("status", "approved"),
      );
    },
  });

  // ── RedTrack events (ClickBank revenue — the main revenue source) ──
  const rtEndTsNext = format(new Date(year, monthIdx + 1, 1), "yyyy-MM-dd");
  const redtrackQuery = useQuery({
    queryKey: ["cashflow-redtrack", start, end],
    queryFn: async () => {
      return fetchAllPaginated<RedTrackRow>(
        "redtrack_events",
        "occurred_at, amount, event_type, currency",
        (q: any) => q.in("event_type", ["purchase", "upsell"])
          .gte("occurred_at", `${start}T03:00:00Z`)
          .lt("occurred_at", `${rtEndTsNext}T03:00:00Z`),
        "occurred_at",
      );
    },
  });

  // ── Previous month sales (for spillover receipts) ──
  const prevSalesQuery = useQuery({
    queryKey: ["cashflow-sales-real-prev", prevStart, prevEnd],
    queryFn: async () => {
      return fetchAllPaginated<SaleRow>(
        "sales_data",
        "date, revenue, status, created_at, store, order_id",
        (q: any) => q.gte("date", prevStart).lte("date", prevEnd).eq("status", "approved"),
      );
    },
  });

  const prevRedtrackQuery = useQuery({
    queryKey: ["cashflow-redtrack-prev", prevStart, prevEnd],
    queryFn: async () => {
      return fetchAllPaginated<RedTrackRow>(
        "redtrack_events",
        "occurred_at, amount, event_type, currency",
        (q: any) => q.in("event_type", ["purchase", "upsell"])
          .gte("occurred_at", `${prevStart}T03:00:00Z`)
          .lt("occurred_at", `${start}T03:00:00Z`),
        "occurred_at",
      );
    },
  });

  // ── Prev-prev month sales (for spillover into prev month) ──
  const prevPrevSalesQuery = useQuery({
    queryKey: ["cashflow-sales-real-prevprev", prevPrevStart, prevPrevEnd],
    queryFn: async () => {
      return fetchAllPaginated<SaleRow>(
        "sales_data",
        "date, revenue, status, created_at, store, order_id",
        (q: any) => q.gte("date", prevPrevStart).lte("date", prevPrevEnd).eq("status", "approved"),
      );
    },
  });

  const prevPrevRedtrackQuery = useQuery({
    queryKey: ["cashflow-redtrack-prevprev", prevPrevStart, prevPrevEnd],
    queryFn: async () => {
      return fetchAllPaginated<RedTrackRow>(
        "redtrack_events",
        "occurred_at, amount, event_type, currency",
        (q: any) => q.in("event_type", ["purchase", "upsell"])
          .gte("occurred_at", `${prevPrevStart}T03:00:00Z`)
          .lt("occurred_at", `${prevStart}T03:00:00Z`),
        "occurred_at",
      );
    },
  });

  // ── Previous month adjustments (for carry-over) ──
  const prevAdjustmentsQuery = useQuery({
    queryKey: ["cashflow-adjustments-prev", prevStart, prevEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashflow_adjustments")
        .select("id, date, type, amount, description")
        .gte("date", prevStart)
        .lte("date", prevEnd)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CashflowAdjustment[];
    },
  });

  // ── Manual adjustments ──
  const adjustmentsQuery = useQuery({
    queryKey: ["cashflow-adjustments", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashflow_adjustments")
        .select("id, date, type, amount, description")
        .gte("date", start)
        .lte("date", end)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CashflowAdjustment[];
    },
  });

  const isLoading =
    settingsQuery.isLoading ||
    prevSettingsQuery.isLoading ||
    modelsQuery.isLoading ||
    spendQuery.isLoading ||
    prevSpendQuery.isLoading ||
    salesQuery.isLoading ||
    redtrackQuery.isLoading ||
    prevSalesQuery.isLoading ||
    prevRedtrackQuery.isLoading ||
    prevPrevSalesQuery.isLoading ||
    prevPrevRedtrackQuery.isLoading ||
    prevAdjustmentsQuery.isLoading ||
    adjustmentsQuery.isLoading;

  const settings = settingsQuery.data;
  const prevSettings = prevSettingsQuery.data;
  const models = modelsQuery.data;
  const spendData = spendQuery.data;
  const prevSpendData = prevSpendQuery.data;
  const salesData = salesQuery.data;
  const redtrackData = redtrackQuery.data;
  const prevSalesData = prevSalesQuery.data;
  const prevRedtrackData = prevRedtrackQuery.data;
  const prevPrevSalesData = prevPrevSalesQuery.data;
  const prevPrevRedtrackData = prevPrevRedtrackQuery.data;
  const prevAdjustmentsData = prevAdjustmentsQuery.data;
  const adjustmentsData = adjustmentsQuery.data;

  // Build projection
  let rows = null as ReturnType<typeof buildCashflowProjection> | null;
  let summary = null as ReturnType<typeof getCashflowSummary> | null;

  if (!isLoading && models && spendData && salesData) {
    // Inherit from previous month settings if current month has no config
    const fallbackSettings = prevSettings ?? null;
    const selectedModelName = settings?.payment_model ?? fallbackSettings?.payment_model ?? "ClickBank Real";
    const model = models.find((m) => m.name === selectedModelName) ?? models[0];
    const tz = settings?.timezone_venda ?? fallbackSettings?.timezone_venda ?? "America/Sao_Paulo";
    const manualInitialCash = settings?.initial_cash ?? 0;
    const marginPercent = settings?.margin_percent ?? fallbackSettings?.margin_percent ?? 0;
    const projectionRoi = (settings as any)?.projection_roi ?? (fallbackSettings as any)?.projection_roi ?? 1.2;

    // Build daily data map from real data
    const dailyMap = new Map<string, DailyData>();

    // Add real spend (already normalized to SP)
    for (const s of spendData) {
      const key = s.sp_date;
      const existing = dailyMap.get(key) || { date: key, adSpend: 0, revenue: 0 };
      existing.adSpend += s.total_spend;
      dailyMap.set(key, existing);
    }

    // ── Smart merge: same logic as dashboard-totals edge function ──
    // Separate CartPanda into clickbank vs non-clickbank
    const isClickbank = (sale: SaleRow) => {
      const storeLower = (sale.store || "").toLowerCase();
      return storeLower === "clickbank" || storeLower === "clickbank_ref" || (sale.order_id || "").toLowerCase().includes("clickbank");
    };

    // Non-clickbank CartPanda revenue → goes directly to dailyMap
    for (const sale of salesData) {
      if (sale.store === "clickbank_ref") continue;
      if (isClickbank(sale)) continue; // will be handled in merge below
      const saleDate = sale.date;
      const existing = dailyMap.get(saleDate) || { date: saleDate, adSpend: 0, revenue: 0 };
      existing.revenue += sale.revenue;
      dailyMap.set(saleDate, existing);
    }

    // CartPanda clickbank revenue by date
    const cbByDate = new Map<string, number>();
    for (const sale of salesData) {
      if (sale.store === "clickbank_ref") continue;
      if (!isClickbank(sale)) continue;
      cbByDate.set(sale.date, (cbByDate.get(sale.date) || 0) + sale.revenue);
    }

    // RedTrack revenue by date
    const rtByDate = new Map<string, number>();
    if (redtrackData) {
      for (const rt of redtrackData) {
        const saleDate = convertToTzDate(rt.occurred_at, "America/Sao_Paulo");
        const cbSpread = 0.983;
        const revBrl = (rt.currency || "USD") === "BRL" ? rt.amount : rt.amount * usdToBrl * cbSpread;
        rtByDate.set(saleDate, (rtByDate.get(saleDate) || 0) + revBrl);
      }
    }

    // Per-date winner: use whichever source has MORE revenue (same as dashboard)
    const allCbDates = new Set([...cbByDate.keys(), ...rtByDate.keys()]);
    for (const date of allCbDates) {
      const cbRev = cbByDate.get(date) || 0;
      const rtRev = rtByDate.get(date) || 0;
      const winnerRev = Math.max(cbRev, rtRev);
      if (winnerRev > 0) {
        const existing = dailyMap.get(date) || { date, adSpend: 0, revenue: 0 };
        existing.revenue += winnerRev;
        dailyMap.set(date, existing);
      }
    }

    // Build prev month daily data for spillover AND carry-over (same smart merge logic)
    const prevMap = new Map<string, DailyData>();

    // Add prev month spend data
    if (prevSpendData) {
      for (const s of prevSpendData) {
        const key = s.sp_date;
        const existing = prevMap.get(key) || { date: key, adSpend: 0, revenue: 0 };
        existing.adSpend += s.total_spend;
        prevMap.set(key, existing);
      }
    }

    if (prevSalesData) {
      const prevIsClickbank = (sale: SaleRow) => {
        const storeLower = (sale.store || "").toLowerCase();
        return storeLower === "clickbank" || storeLower === "clickbank_ref" || (sale.order_id || "").toLowerCase().includes("clickbank");
      };

      // Non-clickbank CartPanda
      for (const sale of prevSalesData) {
        if (sale.store === "clickbank_ref") continue;
        if (prevIsClickbank(sale)) continue;
        const saleDate = sale.date;
        const existing = prevMap.get(saleDate) || { date: saleDate, adSpend: 0, revenue: 0 };
        existing.revenue += sale.revenue;
        prevMap.set(saleDate, existing);
      }

      // CartPanda clickbank by date
      const prevCbByDate = new Map<string, number>();
      for (const sale of prevSalesData) {
        if (sale.store === "clickbank_ref") continue;
        if (!prevIsClickbank(sale)) continue;
        prevCbByDate.set(sale.date, (prevCbByDate.get(sale.date) || 0) + sale.revenue);
      }

      // RedTrack by date
      const prevRtByDate = new Map<string, number>();
      if (prevRedtrackData) {
        for (const rt of prevRedtrackData) {
          const saleDate = convertToTzDate(rt.occurred_at, "America/Sao_Paulo");
          const cbSpread = 0.983;
          const revBrl = (rt.currency || "USD") === "BRL" ? rt.amount : rt.amount * usdToBrl * cbSpread;
          prevRtByDate.set(saleDate, (prevRtByDate.get(saleDate) || 0) + revBrl);
        }
      }

      // Per-date winner
      const prevAllDates = new Set([...prevCbByDate.keys(), ...prevRtByDate.keys()]);
      for (const date of prevAllDates) {
        const cbRev = prevCbByDate.get(date) || 0;
        const rtRev = prevRtByDate.get(date) || 0;
        const winnerRev = Math.max(cbRev, rtRev);
        if (winnerRev > 0) {
          const existing = prevMap.get(date) || { date, adSpend: 0, revenue: 0 };
          existing.revenue += winnerRev;
          prevMap.set(date, existing);
        }
      }
    } else if (prevRedtrackData) {
      // Only RedTrack data available for prev month
      for (const rt of prevRedtrackData) {
        const saleDate = convertToTzDate(rt.occurred_at, "America/Sao_Paulo");
        const cbSpread = 0.983;
        const revBrl = (rt.currency || "USD") === "BRL" ? rt.amount : rt.amount * usdToBrl * cbSpread;
        const existing = prevMap.get(saleDate) || { date: saleDate, adSpend: 0, revenue: 0 };
        existing.revenue += revBrl;
        prevMap.set(saleDate, existing);
      }
    }

    // ── Compute carry-over: run prev month projection to get closing balance ──
    let carryOverBalance = 0;
    if (model && prevMap.size > 0) {
      const prevYear = prevDate.getFullYear();
      const prevMonthIdx = prevDate.getMonth();
      const prevModelName = prevSettings?.payment_model ?? settings?.payment_model ?? "ClickBank Real";
      const prevModel = models.find((m) => m.name === prevModelName) ?? model;
      const prevInitialCash = prevSettings?.initial_cash ?? 0;
      const prevMarginPercent = prevSettings?.margin_percent ?? 0;
      const prevProjectionRoi = (prevSettings as any)?.projection_roi ?? 1.2;

      // Build prev-prev month map for spillover into prev month
      const prevPrevMap = new Map<string, DailyData>();
      if (prevPrevSalesData) {
        const ppIsClickbank = (sale: SaleRow) => {
          const storeLower = (sale.store || "").toLowerCase();
          return storeLower === "clickbank" || storeLower === "clickbank_ref" || (sale.order_id || "").toLowerCase().includes("clickbank");
        };
        for (const sale of prevPrevSalesData) {
          if (sale.store === "clickbank_ref") continue;
          if (ppIsClickbank(sale)) continue;
          const saleDate = sale.date;
          const existing = prevPrevMap.get(saleDate) || { date: saleDate, adSpend: 0, revenue: 0 };
          existing.revenue += sale.revenue;
          prevPrevMap.set(saleDate, existing);
        }
        const ppCbByDate = new Map<string, number>();
        for (const sale of prevPrevSalesData) {
          if (sale.store === "clickbank_ref") continue;
          if (!ppIsClickbank(sale)) continue;
          ppCbByDate.set(sale.date, (ppCbByDate.get(sale.date) || 0) + sale.revenue);
        }
        const ppRtByDate = new Map<string, number>();
        if (prevPrevRedtrackData) {
          for (const rt of prevPrevRedtrackData) {
            const saleDate = convertToTzDate(rt.occurred_at, "America/Sao_Paulo");
            const cbSpread = 0.983;
            const revBrl = (rt.currency || "USD") === "BRL" ? rt.amount : rt.amount * usdToBrl * cbSpread;
            ppRtByDate.set(saleDate, (ppRtByDate.get(saleDate) || 0) + revBrl);
          }
        }
        const ppAllDates = new Set([...ppCbByDate.keys(), ...ppRtByDate.keys()]);
        for (const date of ppAllDates) {
          const cbRev = ppCbByDate.get(date) || 0;
          const rtRev = ppRtByDate.get(date) || 0;
          const winnerRev = Math.max(cbRev, rtRev);
          if (winnerRev > 0) {
            const existing = prevPrevMap.get(date) || { date, adSpend: 0, revenue: 0 };
            existing.revenue += winnerRev;
            prevPrevMap.set(date, existing);
          }
        }
      }

      const prevRows = buildCashflowProjection(
        prevYear, prevMonthIdx, prevInitialCash, prevMarginPercent,
        prevModel, prevMap, prevPrevMap.size > 0 ? prevPrevMap : undefined,
        prevAdjustmentsData ?? undefined, prevProjectionRoi
      );
      if (prevRows.length > 0) {
        carryOverBalance = prevRows[prevRows.length - 1].closingBalance;
      }
    }

    // Final initial cash = carry-over from prev month + manual offset (calibration)
    const initialCash = carryOverBalance + manualInitialCash;

    if (model) {
      rows = buildCashflowProjection(year, monthIdx, initialCash, marginPercent, model, dailyMap, prevMap, adjustmentsData ?? undefined, projectionRoi);
      summary = getCashflowSummary(rows);
    }
  }

  return {
    rows,
    summary,
    settings,
    models,
    isLoading,
    refetch: () => {
      spendQuery.refetch();
      prevSpendQuery.refetch();
      salesQuery.refetch();
      redtrackQuery.refetch();
      prevSalesQuery.refetch();
      prevRedtrackQuery.refetch();
      prevPrevSalesQuery.refetch();
      prevPrevRedtrackQuery.refetch();
      prevAdjustmentsQuery.refetch();
      adjustmentsQuery.refetch();
    },
  };
}
