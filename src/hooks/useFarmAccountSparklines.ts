import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface FarmSparkData {
  /** mapa account_id → array de 7 valores (gasto BRL por dia, do mais antigo ao mais recente) */
  sparkByAccount: Record<string, number[]>;
  /** mapa account_id → gasto últimas 48h (em BRL) */
  spendLast48h: Record<string, number>;
  /** datas (YYYY-MM-DD) usadas na ordem do sparkline */
  dates: string[];
}

/**
 * Busca gasto diário real dos últimos 7 dias por account_id.
 * pra alimentar mini-sparklines nos cards + detecção de "pronta zumbi" (sem gasto há 48h).
 */
export function useFarmAccountSparklines(accountIds: string[] | undefined) {
  const opId = useOperationId();
  const ids = (accountIds || []).slice().sort().join(",");
  return useQuery({
    queryKey: ["farm-account-sparklines", ids, opId],
    enabled: !!accountIds && accountIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FarmSparkData> => {
      const today = new Date();
      const days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }
      const start = days[0];
      const end = days[days.length - 1];

      const params: any = { p_start_date: start, p_end_date: end };
      if (opId) params.p_operation_id = opId;

      const PAGE = 1000;
      const rows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .rpc("get_traffic_spend_by_account_normalized" as any, params)
          .in("account_id", accountIds!)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      // base zerada por account+date
      const accSet = new Set<string>(accountIds!);
      const matrix: Record<string, Record<string, number>> = {};
      accSet.forEach((id) => {
        matrix[id] = {};
        days.forEach((d) => (matrix[id][d] = 0));
      });

      rows.forEach((r: any) => {
        if (!matrix[r.account_id]) return;
        if (!(r.date in matrix[r.account_id])) return;
        matrix[r.account_id][r.date] += Number(r.total_spend || r.spend || 0);
      });

      const sparkByAccount: Record<string, number[]> = {};
      const spendLast48h: Record<string, number> = {};
      const last2 = days.slice(-2);
      Object.entries(matrix).forEach(([id, byDay]) => {
        sparkByAccount[id] = days.map((d) => byDay[d] || 0);
        spendLast48h[id] = last2.reduce((s, d) => s + (byDay[d] || 0), 0);
      });

      return { sparkByAccount, spendLast48h, dates: days };
    },
  });
}
