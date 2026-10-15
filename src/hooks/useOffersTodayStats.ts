import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OfferTodayStats = {
  offer_id: string;
  apelido_interno: string;
  spend_today_brl: number;
  accounts_count: number;
  active_campaigns_count: number;
  revenue_today_brl: number;
  sales_today: number;
  roi_today: number | null;
};

const num = (v: any) => Number(v ?? 0);

/**
 * Lightweight: only TODAY traffic + revenue. Used as the default fast load
 * for the Offers page. 7d/30d are now lazy-loaded via useOffersTraffic7d30d.
 */
export function useOffersTodayStats(operationId?: string | null) {
  return useQuery({
    queryKey: ["offers-today-stats", operationId ?? null],
    queryFn: async () => {
      const [{ data: traffic, error: te }, { data: revenue, error: re }] = await Promise.all([
        supabase.rpc("get_offers_today_traffic" as any, { p_operation_id: operationId ?? undefined } as any),
        supabase.rpc("get_offers_today_revenue" as any, { p_operation_id: operationId ?? undefined } as any),
      ]);
      if (te) throw te;
      if (re) throw re;

      const map = new Map<string, OfferTodayStats>();
      (traffic as any[] | null)?.forEach((r) => {
        map.set(r.offer_id, {
          offer_id: r.offer_id,
          apelido_interno: r.apelido_interno,
          spend_today_brl: num(r.spend_today_brl),
          accounts_count: num(r.accounts_count),
          active_campaigns_count: num(r.active_campaigns_count),
          revenue_today_brl: 0,
          sales_today: 0,
          roi_today: null,
        });
      });
      (revenue as any[] | null)?.forEach((r) => {
        const existing = map.get(r.offer_id) ?? {
          offer_id: r.offer_id,
          apelido_interno: r.apelido_interno,
          spend_today_brl: 0,
          accounts_count: 0,
          active_campaigns_count: 0,
          revenue_today_brl: 0,
          sales_today: 0,
          roi_today: null,
        };
        existing.revenue_today_brl = num(r.revenue_today_brl);
        existing.sales_today = num(r.sales_today);
        existing.roi_today = existing.spend_today_brl > 0
          ? existing.revenue_today_brl / existing.spend_today_brl
          : null;
        map.set(r.offer_id, existing);
      });
      // recompute roi for entries that had only traffic
      map.forEach((v) => {
        v.roi_today = v.spend_today_brl > 0 ? v.revenue_today_brl / v.spend_today_brl : null;
      });
      return map;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export type OrphanTag = { tag: string; spend_brl: number; campaigns_count: number };

export function useOrphanCampaignTagsToday(operationId?: string | null) {
  return useQuery({
    queryKey: ["orphan-tags-today", operationId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_orphan_campaign_tags_today" as any, {
        p_operation_id: operationId ?? undefined,
      } as any);
      if (error) throw error;
      return (data as any[] | null)?.map((r) => ({
        tag: r.tag,
        spend_brl: Number(r.spend_brl ?? 0),
        campaigns_count: Number(r.campaigns_count ?? 0),
      })) ?? [];
    },
    refetchInterval: 300_000,
    staleTime: 120_000,
  });
}
