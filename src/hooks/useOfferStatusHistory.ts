import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OfferStatusHistoryEntry } from "@/types/offers";

export function useOfferStatusHistory(offerId: string | null) {
  return useQuery({
    queryKey: ["offer-status-history", offerId],
    enabled: !!offerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_status_history")
        .select("*")
        .eq("offer_id", offerId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OfferStatusHistoryEntry[];
    },
    staleTime: 60_000,
  });
}
