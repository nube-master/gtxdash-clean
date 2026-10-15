import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface RevenuePoint {
  date: string;
  revenue: number;
}

/**
 * Retorna mapa: vsl_id -> array dos últimos 7 dias de receita (ordem cronológica).
 * Usado para sparkline de tendência de faturamento na tabela de Performance VSL.
 */
export function useVslRevenue7d() {
  const opId = useOperationId();
  return useQuery({
    queryKey: ["vsl-revenue-7d", opId],
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      let q = supabase
        .from("vsl_data")
        .select("video_id, date, revenue")
        .gte("date", startStr)
        .lte("date", endStr);
      if (opId) q = q.eq("operation_id", opId);
      const { data, error } = await q;
      if (error) throw error;

      const bucket = new Map<string, Map<string, number>>();
      for (const r of (data || []) as any[]) {
        const vid = String(r.video_id);
        const d = String(r.date);
        if (!bucket.has(vid)) bucket.set(vid, new Map());
        const m = bucket.get(vid)!;
        m.set(d, (m.get(d) ?? 0) + Number(r.revenue ?? 0));
      }

      const map = new Map<string, RevenuePoint[]>();
      for (const [vid, m] of bucket.entries()) {
        const arr: RevenuePoint[] = [];
        for (const [date, revenue] of m.entries()) arr.push({ date, revenue });
        arr.sort((a, b) => a.date.localeCompare(b.date));
        map.set(vid, arr);
      }
      return map;
    },
  });
}
