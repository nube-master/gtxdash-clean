import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FxHealthRow {
  currency_from: string;
  last_rate_date: string;
  rate_avg: number;
  hours_stale: number;
  is_stale: boolean;
}

/**
 * Saúde das cotações usadas para converter spend (USD/EUR/GBP -> BRL).
 * is_stale = última cotação com mais de 24h.
 */
export function useFxHealth() {
  const query = useQuery({
    queryKey: ["fx-health"],
    queryFn: async (): Promise<FxHealthRow[]> => {
      const { data, error } = await supabase.rpc("get_fx_health");
      if (error) throw error;
      return (data ?? []) as FxHealthRow[];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const rows = query.data ?? [];
  const staleCurrencies = rows.filter((r) => r.is_stale).map((r) => r.currency_from);

  return {
    rows,
    isStale: staleCurrencies.length > 0,
    staleCurrencies,
    isLoading: query.isLoading,
  };
}
