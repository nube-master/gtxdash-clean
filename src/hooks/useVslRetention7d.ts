import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface RetentionPoint {
  date: string;
  retention_pct: number;
  plays: number;
}

/**
 * Retorna mapa: vsl_id -> array dos últimos 7 dias de retenção (ordem cronológica).
 * Usado para sparkline na linha da tabela de Performance VSL.
 */
export function useVslRetention7d() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["vsl-retention-7d", opId],
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vsl_retention_7d" as any, {
        p_operation_id: opId ?? null,
      });
      if (error) throw error;
      const map = new Map<string, RetentionPoint[]>();
      for (const row of (data || []) as any[]) {
        const arr = map.get(row.vsl_id) ?? [];
        arr.push({
          date: row.date,
          retention_pct: Number(row.retention_pct ?? 0),
          plays: Number(row.plays ?? 0),
        });
        map.set(row.vsl_id, arr);
      }
      // garantir ordem cronológica
      for (const arr of map.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
      return map;
    },
  });
}
