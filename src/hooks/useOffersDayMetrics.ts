import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OfferDayMetric {
  offer_id: string;
  spend_brl: number;
  sales: number;
  revenue_brl: number;
  roi: number | null;
}

/** Métricas (spend/vendas/receita/ROI) de offers para um intervalo de datas arbitrário.
 *  - Spend via get_offers_kpi_metrics_range
 *  - Receita/vendas Dual-Source MAX via get_offers_revenue_range
 */
export function useOffersDayMetrics(start: string, end: string, operationId?: string | null) {
  return useQuery({
    queryKey: ["offers-day-metrics", start, end, operationId ?? null],
    queryFn: async () => {
      const [{ data: kpi, error: kErr }, { data: rev, error: rErr }] = await Promise.all([
        supabase.rpc("get_offers_kpi_metrics_range" as any, {
          p_start_date: start, p_end_date: end, p_operation_id: operationId ?? undefined,
        } as any),
        supabase.rpc("get_offers_revenue_range" as any, {
          p_start_date: start, p_end_date: end, p_operation_id: operationId ?? undefined,
        } as any),
      ]);
      if (kErr) throw kErr;
      if (rErr) throw rErr;

      const revMap = new Map<string, any>();
      (rev as any[] | null)?.forEach((r) => revMap.set(r.offer_id, r));

      const map = new Map<string, OfferDayMetric>();
      (kpi as any[] | null)?.forEach((k) => {
        const r = revMap.get(k.offer_id);
        const spend = Number(k.spend_brl ?? 0);
        const revenue = Number(r?.revenue_brl ?? 0);
        const sales = Number(r?.sales ?? 0);
        map.set(k.offer_id, {
          offer_id: k.offer_id,
          spend_brl: spend,
          sales,
          revenue_brl: revenue,
          roi: spend > 0 ? revenue / spend : null,
        });
      });
      // garantir ofertas que só têm revenue (sem spend ainda)
      (rev as any[] | null)?.forEach((r) => {
        if (!map.has(r.offer_id)) {
          const revenue = Number(r.revenue_brl ?? 0);
          map.set(r.offer_id, {
            offer_id: r.offer_id, spend_brl: 0, sales: Number(r.sales ?? 0),
            revenue_brl: revenue, roi: null,
          });
        }
      });
      return map;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
