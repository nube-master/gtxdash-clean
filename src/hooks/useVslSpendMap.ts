import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperation } from "@/contexts/OperationContext";

/**
 * Spend Meta atribuído por VSL no período (split proporcional por views
 * quando a campanha alimenta múltiplas VSLs).
 */
export function useVslSpendMap(startDate?: string, endDate?: string) {
  const { operationId } = useOperation();
  return useQuery({
    queryKey: ["vsl-spend-map", startDate, endDate, operationId],
    enabled: !!startDate && !!endDate,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vsl_spend_breakdown" as any, {
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: operationId ?? undefined,
      } as any);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data as any[]) || []) {
        map.set(r.vsl_id, Number(r.spend_brl ?? 0));
      }
      return map;
    },
  });
}
