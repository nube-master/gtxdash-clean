import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

export function useVslData() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["vsl-data", start, end, opId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vsl_data")
        .select("*")
        .gte("date", start)
        .lte("date", end)
        .match(opId ? { operation_id: opId } : {})
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
