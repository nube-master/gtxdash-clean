import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useMemo } from "react";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { trafficQueryKey, fetchTrafficAggregated } from "@/hooks/useTrafficData";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { useOperationId } from "@/contexts/OperationContext";
import { resolveProductName } from "@/lib/productNames";
import { buildReceiptAmountMap, resolveRedtrackRevenueBrl } from "@/lib/redtrackRevenue";

const SAO_PAULO_TZ = "America/Sao_Paulo";

function toSaoPauloDate(isoDateTime: string | null | undefined, fallbackDay: string) {
  if (!isoDateTime) return fallbackDay;
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return fallbackDay;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function getPreviousPeriod(start: string, end: string): [string, string] {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const prevEnd = new Date(sy, sm - 1, sd - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - (diffDays - 1));

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return [fmt(prevStart), fmt(prevEnd)];
}

function getSaoPauloDayBoundsUTC(day: string) {
  const startUtc = `${day}T03:00:00Z`;
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  const endExclusiveUtc = `${nextDay}T03:00:00Z`;
  return { startUtc, endExclusiveUtc };
}

export function usePreviousPeriodData() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const usdToBrl = useExchangeRate();
  const opId = useOperationId();

  const [prevStart, prevEnd] = useMemo(() => getPreviousPeriod(start, end), [start, end]);

  const salesQuery = useQuery({
    queryKey: ["prev-sales", prevStart, prevEnd, opId],
    queryFn: () =>
      fetchAllPaginated("sales_data", "*", (q: any) => {
        let query = q.gte("date", prevStart).lte("date", prevEnd);
        if (opId) query = query.eq("operation_id", opId);
        return query;
      }),
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs * 2,
  });

  const trafficQuery = useQuery({
    queryKey: [...trafficQueryKey(prevStart, prevEnd), opId],
    queryFn: () => fetchTrafficAggregated(prevStart, prevEnd, opId),
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs * 2,
  });

  const vslQuery = useQuery({
    queryKey: ["prev-vsl", prevStart, prevEnd, opId],
    queryFn: () =>
      fetchAllPaginated("vsl_data", "*", (q: any) => {
        let query = q.gte("date", prevStart).lte("date", prevEnd);
        if (opId) query = query.eq("operation_id", opId);
        return query;
      }),
    refetchInterval: false,
    staleTime: perf.staleTimeMs * 4,
  });

  // RedTrack events for previous period (ICs + all events)
  const prevEndPlusOne = useMemo(() => {
    const d = new Date(prevEnd + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [prevEnd]);

  const redtrackEventsQuery = useQuery({
    queryKey: ["prev-redtrack-events", prevStart, prevEnd, opId],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("redtrack_events")
          .select("*")
          .gte("occurred_at", `${prevStart}T03:00:00Z`)
          .lt("occurred_at", `${prevEndPlusOne}T03:00:00Z`)
          .order("occurred_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) return [];
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      return allData;
    },
    refetchInterval: false,
    staleTime: perf.staleTimeMs * 4,
  });

  // RedTrack sales (purchase + upsell) converted to sales_data format
  const redtrackSalesQuery = useQuery({
    queryKey: ["prev-redtrack-sales", prevStart, prevEnd, usdToBrl, opId],
    queryFn: async () => {
      const { startUtc } = getSaoPauloDayBoundsUTC(prevStart);
      const { endExclusiveUtc } = getSaoPauloDayBoundsUTC(prevEnd);
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase
          .from("redtrack_events")
          .select("*")
          .in("event_type", ["purchase", "upsell"])
          .gte("occurred_at", startUtc)
          .lt("occurred_at", endExclusiveUtc)
          .order("occurred_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) return [];
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const auditRows = await fetchAllPaginated(
        "clickbank_audit",
        "receipt, amount_brl",
        (q: any) => {
          let query = q.gte("date", prevStart).lte("date", prevEnd).eq("transaction_type", "SALE").gte("amount_usd", 200).lte("amount_usd", 260);
          if (opId) query = query.eq("operation_id", opId);
          return query;
        },
        "created_at",
        false,
      );
      const receiptAmountMap = buildReceiptAmountMap(auditRows as any[]);

      const filtered = allData.filter((e: any) => e.event_type === "upsell" || Number(e.amount || 0) > 0);
      return filtered.map((e) => ({
        id: e.id,
        date: toSaoPauloDate(e.occurred_at, prevStart),
        revenue: resolveRedtrackRevenueBrl(e, usdToBrl, receiptAmountMap),
        status: "approved",
        order_id: e.redtrack_id || e.id,
        product_name: resolveProductName(e.offer_name, e.product_name, "RedTrack"),
        offer_name: e.offer_name,
        store: "redtrack",
        utm_source: e.utm_source,
        utm_campaign: e.utm_campaign,
        utm_content: e.utm_content,
        event_type: e.event_type || "purchase",
        _source: "redtrack",
      }));
    },
    refetchInterval: false,
    staleTime: perf.staleTimeMs * 4,
  });

  return {
    prevSales: salesQuery.data || [],
    prevTraffic: trafficQuery.data || [],
    prevVsl: vslQuery.data || [],
    prevRedtrackEvents: redtrackEventsQuery.data || [],
    prevRedtrackSales: redtrackSalesQuery.data || [],
    isLoading: salesQuery.isLoading || trafficQuery.isLoading || vslQuery.isLoading,
  };
}
