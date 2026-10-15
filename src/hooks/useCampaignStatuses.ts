import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

interface CampaignStatus {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  effective_status: string;
  daily_budget: number;
  lifetime_budget: number;
  updated_at: string;
}

export function useCampaignStatuses() {
  const queryClient = useQueryClient();
  const perf = useMobilePerformance();
  const opId = useOperationId();

  const query = useQuery({
    queryKey: ["campaign-statuses", opId],
    queryFn: async (): Promise<CampaignStatus[]> => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from("meta_campaign_status" as any)
          .select("*")
          .order("campaign_name", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      return allData as CampaignStatus[];
    },
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });

  const syncNow = useCallback(async () => {
    const res = await supabase.functions.invoke("sync-campaign-status", {
      body: opId ? { operation_id: opId } : {},
    });
    if (res.error) throw res.error;
    queryClient.invalidateQueries({ queryKey: ["campaign-statuses"] });
    return res.data;
  }, [queryClient, opId]);

  return { ...query, syncNow };
}
