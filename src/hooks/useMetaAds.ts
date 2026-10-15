import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

export interface MetaAdRow {
  id: string;
  name: string;
  hook_name?: string;
  thumbnail_url?: string;
  status: string;
  adset_id: string;
  adset_name: string;
  campaign_name: string;
  account_name: string;
  gasto: number;
  impressoes: number;
  ctr: number;
  cpc: number;
  cpa: number;
  vendas: number;
  ic: number;
  conv_checkout: number;
  roas: number;
  lucro: number;
  faturamento: number;
  margem: number;
  score: number;
}

export function useMetaAds(adsetIds?: string[]) {
  const { dateRange, rangeKey } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["meta-ads", start, end, opId, adsetIds, rangeKey],
    queryFn: async (): Promise<MetaAdRow[]> => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;

      const params: any = {
        p_start_date: start,
        p_end_date: end,
        p_adset_ids: adsetIds && adsetIds.length > 0 ? adsetIds : null
      };
      if (opId) params.p_operation_id = opId;

      while (hasMore) {
        const { data, error } = await supabase
          .rpc("list_ads" as any, params)
          .range(from, from + PAGE - 1);

        if (error) {
          console.warn("[useMetaAds] RPC error (might not exist yet):", error.message);
          return [];
        }

        const rows = data || [];
        all = all.concat(rows);
        hasMore = rows.length === PAGE;
        from += PAGE;
      }

      return all as MetaAdRow[];
    },
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
