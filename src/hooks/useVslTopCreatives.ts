import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface VslTopCreative {
  ad_name: string;
  campaign_name: string;
  attributed_spend_brl: number;
  total_spend_brl: number;
  impressions: number;
  link_clicks: number;
  share_pct: number;
}

/**
 * Top criativos que estão alimentando uma VSL específica no período.
 * Atribuição: share de views Vturb por (campanha,dia) × spend daquela campanha/criativo.
 */
export function useVslTopCreatives(vslId: string | null, startDate?: string, endDate?: string, limit = 3) {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["vsl-top-creatives", vslId, startDate, endDate, opId, limit],
    enabled: !!vslId && !!startDate && !!endDate,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VslTopCreative[]> => {
      const { data, error } = await supabase.rpc("get_vsl_top_creatives" as any, {
        p_vsl_id: vslId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: opId ?? null,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        ad_name: r.ad_name,
        campaign_name: r.campaign_name,
        attributed_spend_brl: Number(r.attributed_spend_brl ?? 0),
        total_spend_brl: Number(r.total_spend_brl ?? 0),
        impressions: Number(r.impressions ?? 0),
        link_clicks: Number(r.link_clicks ?? 0),
        share_pct: Number(r.share_pct ?? 0),
      }));
    },
  });
}
