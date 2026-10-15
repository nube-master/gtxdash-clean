import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";

export interface MetaAdStatus {
  ad_id: string;
  name: string;
  status: string;
  adset_id: string;
  campaign_id: string;
}

export function useMetaAdStatus() {
  const opId = useOperationId();
  const perf = useMobilePerformance();

  return useQuery({
    queryKey: ["meta-ad-status", opId],
    queryFn: async (): Promise<MetaAdStatus[]> => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from("meta_ad_status")
          .select("ad_id, name, status, adset_id, campaign_id")
          .range(from, from + PAGE_SIZE - 1);
        
        if (opId) q = q.eq("operation_id", opId);
        
        const { data, error } = await q;
        if (error) throw error;
        
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      return allData as MetaAdStatus[];
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
