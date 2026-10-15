import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

interface RealtimeSpendData {
  totalSpendRealtime: number;
  accountCount: number;
  lastFetched: string | null;
}

export function useRealtimeSpend(enabled = true) {
  const opId = useOperationId();

  return useQuery<RealtimeSpendData>({
    queryKey: ["realtime-spend-safe", opId],
    queryFn: async () => {
      const todaySP = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());

      let q = supabase
        .from("meta_spend_realtime_safe" as any)
        .select("spend_brl, fetched_at")
        .eq("sp_date", todaySP);
      if (opId) q = q.eq("operation_id", opId);

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data as any[]) || [];
      const totalSpendRealtime = rows.reduce(
        (sum, r) => sum + Number(r.spend_brl || 0),
        0
      );
      const lastFetched = rows.length > 0
        ? rows.reduce((latest, r) =>
            r.fetched_at > latest ? r.fetched_at : latest,
          rows[0].fetched_at)
        : null;

      return {
        totalSpendRealtime,
        accountCount: rows.length,
        lastFetched,
      };
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
