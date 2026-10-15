import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cliques no botão do VSL (Vturb) para a operação/intervalo.
 * Fonte: vsl_data.button_clicks (o "clique CTA" do player Vturb).
 * Também expõe checkout_clicks (o subset que foi pro checkout).
 *
 * Usado como fallback quando RedTrack não tem eventos de initiate_checkout
 * e o pixel da Meta está sub-reportando ICs (caso Escola do Dólar).
 */
export function useVslButtonClicks(
  startDate: string,
  endDate: string,
  operationId?: string | null,
) {
  return useQuery({
    queryKey: ["vsl-button-clicks", startDate, endDate, operationId ?? null],
    enabled: !!startDate && !!endDate,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      let q = supabase
        .from("vsl_data")
        .select("button_clicks, checkout_clicks")
        .gte("date", startDate)
        .lte("date", endDate);
      if (operationId) q = q.eq("operation_id", operationId);
      const { data, error } = await q;
      if (error) throw error;
      const buttonClicks = (data || []).reduce(
        (s, r: any) => s + Number(r.button_clicks || 0),
        0,
      );
      const checkoutClicks = (data || []).reduce(
        (s, r: any) => s + Number(r.checkout_clicks || 0),
        0,
      );
      return { buttonClicks, checkoutClicks };
    },
  });
}
