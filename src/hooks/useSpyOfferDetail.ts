import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SpyOffer } from "@/types/spy";

export function useSpyOfferDetail(offerId: string | undefined) {
  return useQuery({
    queryKey: ["spy-offer-detail", offerId],
    enabled: !!offerId,
    staleTime: 30_000,
    queryFn: async () => {
      const [offerRes, adsRes, lpsRes, historyRes] = await Promise.all([
        supabase.from("spy_offers").select("*").eq("id", offerId!).maybeSingle(),
        supabase.from("spy_ads").select("*").eq("offer_id", offerId!).order("ad_last_seen_at", { ascending: false }),
        supabase.from("spy_lps").select("*").eq("offer_id", offerId!).order("scraped_at", { ascending: false }),
        supabase
          .from("spy_history")
          .select("snapshot_at, active_ads_count, total_ads_count, raw_snapshot")
          .eq("offer_id", offerId!)
          .order("snapshot_at", { ascending: true })
          .limit(90),
      ]);
      if (offerRes.error) throw offerRes.error;
      return {
        offer: offerRes.data as SpyOffer | null,
        ads: adsRes.data ?? [],
        lps: lpsRes.data ?? [],
        history: (historyRes.data ?? []) as Array<{
          snapshot_at: string;
          active_ads_count: number | null;
          total_ads_count: number | null;
          raw_snapshot?: unknown;
        }>,
      };
    },
  });
}
