import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VslUtmRow {
  utm_value: string;
  total_views: number;
  unique_views: number;
  total_plays: number;
  unique_plays: number;
  play_rate: number;
  retention_rate: number;
  button_clicks: number;
  checkout_clicks: number;
}

export function useVslUtm(
  playerId: string | null,
  startDate?: string,
  endDate?: string,
  groupBy: string = "utm_campaign"
) {
  return useQuery({
    queryKey: ["vsl-utm", playerId, startDate, endDate, groupBy],
    queryFn: async (): Promise<VslUtmRow[]> => {
      const { data, error } = await supabase.functions.invoke("get-vsl-utm", {
        body: {
          player_id: playerId,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          group_by: groupBy,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.rows || [];
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });
}
