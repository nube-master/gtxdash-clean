import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

export function useBreakdownData() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["traffic-breakdowns", start, end, opId],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from("traffic_breakdowns")
          .select("*")
          .gte("date", start)
          .lte("date", end)
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      return allData;
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
