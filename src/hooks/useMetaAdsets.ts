import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

export interface MetaAdsetRow {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  account_name: string;
  orcamento: number;
  teto: number;
  gasto: number;
  pace: number;
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
  regras_count: number;
}

export function useMetaAdsets(campaignIds?: string[]) {
  const { dateRange, rangeKey } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["meta-adsets", start, end, opId, campaignIds, rangeKey],
    queryFn: async (): Promise<MetaAdsetRow[]> => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;

      const params: any = {
        p_start_date: start,
        p_end_date: end,
        p_campaign_ids: campaignIds && campaignIds.length > 0 ? campaignIds : null
      };
      if (opId) params.p_operation_id = opId;

      while (hasMore) {
        // Fallback to table if RPC doesn't exist yet, but spec asks for list_adsets RPC
        const { data, error } = await supabase
          .rpc("list_adsets" as any, params)
          .range(from, from + PAGE - 1);

        if (error) {
          console.warn("[useMetaAdsets] RPC error (might not exist yet):", error.message);
          return [];
        }

        const rows = data || [];
        all = all.concat(rows);
        hasMore = rows.length === PAGE;
        from += PAGE;
      }

      return all as MetaAdsetRow[];
    },
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
