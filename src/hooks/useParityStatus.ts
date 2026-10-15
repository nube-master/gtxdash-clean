import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/DateRangeContext";

export interface ParityStatus {
  date: string;
  clickbank: { count: number; revenue_usd: number; revenue_brl: number };
  redtrack: { count: number; revenue_brl: number };
  gap: { count: number; pct: number };
  coverage_pct: number;
  usd_to_brl: number;
}

export function useParityStatus() {
  const { dateRange } = useDateRange();
  const [start] = dateRange;

  return useQuery<ParityStatus>({
    queryKey: ["parity-status", start],
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${baseUrl}/functions/v1/reconcile-sales?mode=status&date=${start}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) throw new Error(`Parity check failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 2 * 60_000, // every 2 min
    staleTime: 60_000,
  });
}
