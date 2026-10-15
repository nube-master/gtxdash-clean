import { useQuery } from "@tanstack/react-query";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { supabase } from "@/integrations/supabase/client";
import { trafficQueryKey, fetchTrafficAggregated } from "@/hooks/useTrafficData";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

export function useRealSalesByRange(start: string, end: string) {
  const perf = useMobilePerformance();
  const opId = useOperationId();
  return useQuery({
    queryKey: ["real-sales-range", start, end, opId],
    queryFn: async () => {
      return fetchAllPaginated(
        "sales_data",
        "*",
        (q: any) => {
          let query = q.gte("date", start).lte("date", end).or("store.neq.clickbank_ref,store.is.null");
          if (opId) query = query.eq("operation_id", opId);
          return query;
        },
        "created_at",
        false,
      );
    },
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}

/**
 * Reuses the same query key as useTrafficData so React Query deduplicates
 * when the date range matches the context date range.
 */
export function useTrafficDataByRange(start: string, end: string) {
  const perf = useMobilePerformance();
  const opId = useOperationId();
  return useQuery({
    queryKey: trafficQueryKey(start, end, opId),
    queryFn: () => fetchTrafficAggregated(start, end, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}

/**
 * Lightweight traffic spend hook for financial calculations.
 * Groups only by account_id + date (instead of ad-level),
 * avoiding statement timeouts on multi-day ranges.
 */
async function fetchTrafficSpendByAccount(start: string, end: string, opId?: string | null) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  const params: any = { p_start_date: start, p_end_date: end };
  if (opId) params.p_operation_id = opId;

  while (hasMore) {
    const { data, error } = await supabase
      // Fonte normalizada BRT (traffic_data_hourly): mesma RPC da Central de
      // Contingência. Evita inflar contas em fuso != SP (Dubai/Sydney/Denver)
      // cujo "dia local" cobre horas do dia BRT anterior.
      .rpc("get_traffic_spend_by_account_normalized" as any, params)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }

  return all.map((row: any) => ({
    account_id: row.account_id,
    date: row.date,
    spend: Number(row.total_spend),
    // true = conta sem cobertura horária BRT no dia; usamos o daily como reserva
    usedFallback: Boolean(row.used_fallback),
  }));
}

export function useTrafficSpendByAccount(start: string, end: string) {
  const perf = useMobilePerformance();
  const opId = useOperationId();
  return useQuery({
    queryKey: ["traffic-spend-by-account", start, end, opId],
    queryFn: () => fetchTrafficSpendByAccount(start, end, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
