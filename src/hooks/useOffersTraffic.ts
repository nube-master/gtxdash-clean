import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OfferTrafficStats = {
  offer_id: string;
  apelido_interno: string;
  spend_today_brl: number;
  spend_7d_brl: number;
  spend_30d_brl: number;
  accounts_count: number;
  active_campaigns_count: number;
  last_spend_date: string | null;
};

export type OfferRevenueStats = {
  offer_id: string;
  apelido_interno: string;
  revenue_today_brl: number;
  sales_today: number;
  revenue_7d_brl: number;
  sales_7d: number;
  revenue_30d_brl: number;
  sales_30d: number;
};

export type OfferPerformanceStats = OfferTrafficStats &
  OfferRevenueStats & {
    roi_7d: number | null;   // revenue / spend
    roi_30d: number | null;
    profit_7d_brl: number;   // revenue - spend (gross)
    profit_30d_brl: number;
  };

const num = (v: any) => Number(v ?? 0);

/**
 * Combined offer performance: Meta spend (matched by [APELIDO] tag) + Dual-Source MAX revenue.
 * Polls every 2 minutes (background, no spinner).
 */
export function useOffersTraffic(operationId?: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["offers-performance", operationId ?? null],
    enabled,
    queryFn: async () => {
      // Offers são globais (sem operation_id) → stats também precisam ser globais,
      // senão um usuário em ESCALIFY vê o card MMP vazio mesmo com R$ 28k de spend em GTX.
      const [{ data: traffic, error: te }, { data: revenue, error: re }] = await Promise.all([
        supabase.rpc("get_offers_traffic_stats", {} as any),
        supabase.rpc("get_offers_revenue_stats", {} as any),
      ]);
      if (te) throw te;
      if (re) throw re;

      const trafficMap = new Map<string, OfferTrafficStats>();
      (traffic as OfferTrafficStats[] | null)?.forEach((r) => {
        trafficMap.set(r.offer_id, {
          ...r,
          spend_today_brl: num(r.spend_today_brl),
          spend_7d_brl: num(r.spend_7d_brl),
          spend_30d_brl: num(r.spend_30d_brl),
          accounts_count: num(r.accounts_count),
          active_campaigns_count: num(r.active_campaigns_count),
        });
      });

      const revenueMap = new Map<string, OfferRevenueStats>();
      (revenue as OfferRevenueStats[] | null)?.forEach((r) => {
        revenueMap.set(r.offer_id, {
          ...r,
          revenue_today_brl: num(r.revenue_today_brl),
          sales_today: num(r.sales_today),
          revenue_7d_brl: num(r.revenue_7d_brl),
          sales_7d: num(r.sales_7d),
          revenue_30d_brl: num(r.revenue_30d_brl),
          sales_30d: num(r.sales_30d),
        });
      });

      // Merge: union of offer ids
      const all = new Set<string>([...trafficMap.keys(), ...revenueMap.keys()]);
      const merged = new Map<string, OfferPerformanceStats>();
      all.forEach((id) => {
        const t = trafficMap.get(id);
        const r = revenueMap.get(id);
        const apelido = t?.apelido_interno ?? r?.apelido_interno ?? "";
        const spend7 = t?.spend_7d_brl ?? 0;
        const spend30 = t?.spend_30d_brl ?? 0;
        const rev7 = r?.revenue_7d_brl ?? 0;
        const rev30 = r?.revenue_30d_brl ?? 0;
        merged.set(id, {
          offer_id: id,
          apelido_interno: apelido,
          spend_today_brl: t?.spend_today_brl ?? 0,
          spend_7d_brl: spend7,
          spend_30d_brl: spend30,
          accounts_count: t?.accounts_count ?? 0,
          active_campaigns_count: t?.active_campaigns_count ?? 0,
          last_spend_date: t?.last_spend_date ?? null,
          revenue_today_brl: r?.revenue_today_brl ?? 0,
          sales_today: r?.sales_today ?? 0,
          revenue_7d_brl: rev7,
          sales_7d: r?.sales_7d ?? 0,
          revenue_30d_brl: rev30,
          sales_30d: r?.sales_30d ?? 0,
          roi_7d: spend7 > 0 ? rev7 / spend7 : null,
          roi_30d: spend30 > 0 ? rev30 / spend30 : null,
          profit_7d_brl: rev7 - spend7,
          profit_30d_brl: rev30 - spend30,
        });
      });
      return merged;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}

export type OfferTrafficDaily = { date: string; spend_brl: number };

export function useOfferTrafficDaily(offerId: string | null, operationId?: string | null) {
  return useQuery({
    queryKey: ["offer-traffic-daily", offerId],
    enabled: !!offerId,
    queryFn: async () => {
      // Global (offers não têm operation_id)
      const { data, error } = await supabase.rpc("get_offer_traffic_daily", {
        p_offer_id: offerId,
      } as any);
      if (error) throw error;
      return (data as OfferTrafficDaily[] | null)?.map((d) => ({
        date: d.date,
        spend_brl: num(d.spend_brl),
      })) ?? [];
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
}
