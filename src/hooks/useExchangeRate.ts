import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FALLBACK_RATE = 5.15;

export function useExchangeRate() {
  const { data: rate = FALLBACK_RATE } = useQuery({
    queryKey: ["exchange-rate-usd-brl"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-exchange-rate");
      if (error) {
        console.warn("Exchange rate fetch failed, using fallback", error);
        return FALLBACK_RATE;
      }
      return data?.rate ?? FALLBACK_RATE;
    },
    staleTime: 30 * 60 * 1000, // 30 min
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });

  return rate;
}
