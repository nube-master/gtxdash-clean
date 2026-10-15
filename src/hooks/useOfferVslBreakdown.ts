import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VslBreakdownItem {
  video_id: string;
  video_name: string;
  total_views: number;
  unique_views: number;
  avg_retention: number | null;
  button_clicks: number;
  checkout_clicks: number;
  conversion_rate: number | null;
  revenue: number;
}

/**
 * Breakdown por VSL (uma "coluna" por vídeo) para a oferta no período.
 * Match por sigla [APELIDO] no video_name (case-insensitive).
 */
export function useOfferVslBreakdown(
  apelido: string | null | undefined,
  start: string,
  end: string,
  operationId?: string | null,
) {
  return useQuery({
    queryKey: ["offer-vsl-breakdown", apelido, start, end, operationId ?? null],
    enabled: !!apelido,
    queryFn: async (): Promise<VslBreakdownItem[]> => {
      const tag = `[${apelido}]`;
      let q = supabase
        .from("vsl_data")
        .select(
          "video_id, video_name, total_views, unique_views, retention_rate, button_clicks, checkout_clicks, revenue, date",
        )
        .ilike("video_name", `%${tag}%`)
        .gte("date", start)
        .lte("date", end);
      if (operationId) q = q.eq("operation_id", operationId);

      const { data, error } = await q;
      if (error) throw error;

      const map = new Map<string, VslBreakdownItem & { _retSum: number; _retDays: number }>();
      (data ?? []).forEach((r: any) => {
        const id = r.video_id as string;
        const cur =
          map.get(id) ??
          ({
            video_id: id,
            video_name: r.video_name ?? "",
            total_views: 0,
            unique_views: 0,
            avg_retention: null,
            button_clicks: 0,
            checkout_clicks: 0,
            conversion_rate: null,
            revenue: 0,
            _retSum: 0,
            _retDays: 0,
          } as any);

        cur.total_views += Number(r.total_views ?? 0);
        cur.unique_views += Number(r.unique_views ?? 0);
        cur.button_clicks += Number(r.button_clicks ?? 0);
        cur.checkout_clicks += Number(r.checkout_clicks ?? 0);
        cur.revenue += Number(r.revenue ?? 0);
        if (r.retention_rate != null) {
          cur._retSum += Number(r.retention_rate);
          cur._retDays += 1;
        }
        if (!cur.video_name && r.video_name) cur.video_name = r.video_name;
        map.set(id, cur);
      });

      return Array.from(map.values())
        .map((v) => ({
          video_id: v.video_id,
          video_name: v.video_name,
          total_views: v.total_views,
          unique_views: v.unique_views,
          avg_retention: v._retDays > 0 ? v._retSum / v._retDays : null,
          button_clicks: v.button_clicks,
          checkout_clicks: v.checkout_clicks,
          conversion_rate:
            v.unique_views > 0 ? (v.checkout_clicks / v.unique_views) * 100 : null,
          revenue: v.revenue,
        }))
        .sort((a, b) => b.total_views - a.total_views);
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
