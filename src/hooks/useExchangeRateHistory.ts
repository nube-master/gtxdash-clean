import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExchangeRateDay {
  date: string;
  rate: number;
}

export function useExchangeRateHistory() {
  return useQuery<ExchangeRateDay[]>({
    queryKey: ["exchange-rate-history"],
    queryFn: async () => {
      // Usa a fonte interna de câmbio para evitar CORS e manter paridade com os KPIs.
      const { data, error } = await supabase
        .from("exchange_rate_log")
        .select("rate, created_at")
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) throw error;

      const byDay = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ rate: number | string | null; created_at: string | null }>) {
        if (!row.created_at || row.rate == null) continue;
        const day = new Date(row.created_at).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
        });
        if (!byDay.has(day)) byDay.set(day, Number(row.rate));
        if (byDay.size >= 7) break;
      }

      return Array.from(byDay.entries())
        .map(([date, rate]) => ({ date, rate }))
        .reverse();
    },
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });
}
