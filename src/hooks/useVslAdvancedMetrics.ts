import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";

export interface VslAdvancedMetric {
  pitch_pct_weighted: number | null;
  plays_total: number;
  views_total: number;
  unique_views_total: number;
  play_rate_pct: number | null;
  hook_rate_pct: number | null;
  impressions_total: number;
  video_3s_total: number;
  offer_id: string | null;
  offer_apelido: string | null;
  offer_nicho: string | null;
  bench_cpi_brl: number | null;
  bench_conversion_pct: number | null;
  bench_pitch_pct: number | null;
}

export function useVslAdvancedMetrics(startDate?: string, endDate?: string) {
  const opId = useOperationId();

  return useQuery({
    queryKey: ["vsl-advanced-metrics", startDate, endDate, opId],
    enabled: !!startDate && !!endDate && !!opId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vsl_advanced_metrics" as any, {
        p_start_date: startDate,
        p_end_date: endDate,
        p_operation_id: opId,
      });
      if (error) throw error;
      const map = new Map<string, VslAdvancedMetric>();
      for (const row of (data || []) as any[]) {
        map.set(row.vsl_id, {
          pitch_pct_weighted: row.pitch_pct_weighted,
          plays_total: Number(row.plays_total ?? 0),
          views_total: Number(row.views_total ?? 0),
          unique_views_total: Number(row.unique_views_total ?? 0),
          play_rate_pct: row.play_rate_pct == null ? null : Number(row.play_rate_pct),
          hook_rate_pct: row.hook_rate_pct,
          impressions_total: Number(row.impressions_total ?? 0),
          video_3s_total: Number(row.video_3s_total ?? 0),
          offer_id: row.offer_id,
          offer_apelido: row.offer_apelido,
          offer_nicho: row.offer_nicho,
          bench_cpi_brl: row.bench_cpi_brl,
          bench_conversion_pct: row.bench_conversion_pct,
          bench_pitch_pct: row.bench_pitch_pct,
        });
      }
      return map;
    },
  });
}
