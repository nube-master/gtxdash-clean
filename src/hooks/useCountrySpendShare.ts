import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface CountryBreakdownRow {
  date: string;
  account_id: string;
  campaign_name: string;
  country: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  inline_link_clicks: number;
}

/**
 * Gasto de Meta Ads por país (breakdown_type = 'country'), no range informado.
 * Usado para filtrar projetos que só devem contar tráfego de um país (ex: EDD-BR → BR).
 */
export function useCountrySpendShare(start: string, end: string) {
  const opId = useOperationId();

  return useQuery({
    queryKey: ["country-spend-share", start, end, opId],
    enabled: !!opId && !!start && !!end,
    staleTime: 120_000,
    queryFn: async (): Promise<CountryBreakdownRow[]> => {
      const PAGE = 1000;
      let from = 0;
      let all: CountryBreakdownRow[] = [];
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from("traffic_breakdowns")
          .select("date, account_id, campaign_name, country, spend, spend_brl, impressions, clicks, inline_link_clicks")
          .eq("breakdown_type", "country")
          .gte("date", start)
          .lte("date", end)
          .range(from, from + PAGE - 1);
        if (opId) q = q.eq("operation_id", opId);
        const { data, error } = await q;
        if (error) throw error;
        // spend_brl é a fonte autoritativa (spend cru vem na moeda da conta)
        const rows = ((data || []) as any[]).map((r) => ({
          ...r,
          spend: Number(r.spend_brl ?? r.spend ?? 0),
        })) as CountryBreakdownRow[];
        all = all.concat(rows);
        hasMore = rows.length === PAGE;
        from += PAGE;

      }

      return all;
    },
  });
}
