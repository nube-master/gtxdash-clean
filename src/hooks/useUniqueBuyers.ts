import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useUniqueBuyers(
  operationId: string | null | undefined,
  startDate: string,
  endDate: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["unique-buyers", operationId, startDate, endDate],
    enabled: enabled && !!operationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_unique_buyers", {
        p_operation_id: operationId as string,
        p_start: startDate,
        p_end: endDate,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        uniqueBuyers: Number(row?.unique_buyers ?? 0),
        totalRevenueBrl: Number(row?.total_revenue_brl ?? 0),
        totalTransactions: Number(row?.total_transactions ?? 0),
        arpuBrl: Number(row?.arpu_brl ?? 0),
      };
    },
  });
}
