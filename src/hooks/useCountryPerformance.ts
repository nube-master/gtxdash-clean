import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface CountryPerformance {
  country_code: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_link_clicks: number;
  total_lp_views: number;
  total_ics: number;
  total_purchases: number;
  total_revenue: number;
  real_revenue: number;
  roas: number;
  real_roas: number;
  cpc: number;
  cpa: number;
  connect_rate: number;
}


export function useCountryPerformance(startDate: string, endDate: string, minSpend: number = 0) {
  const operationId = useOperationId();

  return useQuery({
    queryKey: ["country-performance", operationId, startDate, endDate, minSpend],
    queryFn: async () => {
      if (!operationId) return [];

      const { data, error } = await supabase.rpc("get_country_performance", {
        p_operation_id: operationId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_min_spend: minSpend,
      });

      if (error) {
        console.error("Error fetching country performance:", error);
        throw error;
      }

      return data as CountryPerformance[];
    },
    enabled: !!operationId && !!startDate && !!endDate,
  });
}
