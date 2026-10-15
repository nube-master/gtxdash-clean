import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OfferVslMetrics {
  vsl_count_total: number;
  vsl_count_period: number;
  total_views: number;
  unique_views: number;
  button_clicks: number;
  checkout_clicks: number;
  revenue: number;
  avg_retention: number | null;
  conversion_rate: number | null;
}

/** Métricas agregadas de VSL para uma oferta no período (match exato da sigla). */
export function useOfferVslMetrics(
  apelido: string | null | undefined,
  start: string,
  end: string,
  operationId?: string | null,
) {
  return useQuery({
    queryKey: ["offer-vsl-metrics", apelido, start, end, operationId ?? null],
    enabled: !!apelido,
    queryFn: async (): Promise<OfferVslMetrics | null> => {
      const { data, error } = await supabase.rpc("get_offer_vsl_metrics" as any, {
        p_apelido: apelido,
        p_start_date: start,
        p_end_date: end,
        p_operation_id: operationId ?? undefined,
      } as any);
      if (error) throw error;
      const row = (data as any[] | null)?.[0];
      if (!row) return null;
      return {
        vsl_count_total: Number(row.vsl_count_total ?? 0),
        vsl_count_period: Number(row.vsl_count_period ?? 0),
        total_views: Number(row.total_views ?? 0),
        unique_views: Number(row.unique_views ?? 0),
        button_clicks: Number(row.button_clicks ?? 0),
        checkout_clicks: Number(row.checkout_clicks ?? 0),
        revenue: Number(row.revenue ?? 0),
        avg_retention: row.avg_retention == null ? null : Number(row.avg_retention),
        conversion_rate: row.conversion_rate == null ? null : Number(row.conversion_rate),
      };
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

/** Contagem de VSLs por oferta (todas as ofertas). Usado na coluna da tabela. */
export function useOffersVslCounts(operationId?: string | null) {
  return useQuery({
    queryKey: ["offers-vsl-counts", operationId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_offers_vsl_counts" as any, {
        p_operation_id: operationId ?? undefined,
      } as any);
      if (error) throw error;
      const map = new Map<string, number>();
      (data as any[] | null)?.forEach((r) => map.set(r.offer_id, Number(r.vsl_count ?? 0)));
      return map;
    },
    refetchInterval: 300_000,
    staleTime: 120_000,
  });
}
