import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

interface SpendRow {
  account_id: string;
  date: string;
  spend: number;
  /** true = sem cobertura horária BRT no dia; valor veio do daily (sync horário pendente) */
  usedFallback: boolean;
}

async function fetchSpendByAccount(start: string, end: string, opId?: string | null): Promise<SpendRow[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  const params: any = { p_start_date: start, p_end_date: end };
  if (opId) params.p_operation_id = opId;

  while (hasMore) {
    const { data, error } = await supabase
      .rpc("get_traffic_spend_by_account_normalized" as any, params)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const rows = (data as any[]) || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }

  return all.map((r) => ({
    account_id: r.account_id,
    date: r.date,
    spend: Number(r.total_spend),
    usedFallback: Boolean(r.used_fallback),
  }));
}

export function useSpendByAccount() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["spend-by-account", start, end, opId],
    queryFn: () => fetchSpendByAccount(start, end, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
