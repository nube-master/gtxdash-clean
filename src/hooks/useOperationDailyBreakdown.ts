import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OpDailyRow {
  date: string; // YYYY-MM-DD
  spend: number;
  revenue: number;
  sales: number;
  lucro: number;
  roas: number;
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** BRT day for a UTC timestamp string */
function brtDay(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts));
}

async function fetchSalesByDay(opId: string, start: string, end: string) {
  const PAGE = 1000;
  const byDay = new Map<string, { revenue: number; sales: number }>();
  let from = 0;
  let hasMore = true;
  // Widen the UTC window by ±1 day so BRT bucketing at the edges is complete.
  const startUtc = `${start}T00:00:00Z`;
  const endUtc = new Date(new Date(`${end}T00:00:00Z`).getTime() + 36 * 3600_000).toISOString();

  while (hasMore) {
    const { data, error } = await supabase
      .from("sales_data")
      .select("created_at, revenue, store")
      .eq("operation_id", opId)
      .gte("created_at", startUtc)
      .lte("created_at", endUtc)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      if ((r as any).store === "clickbank_ref") continue;
      const day = brtDay((r as any).created_at);
      if (day < start || day > end) continue;
      const cur = byDay.get(day) ?? { revenue: 0, sales: 0 };
      cur.revenue += num((r as any).revenue);
      cur.sales += 1;
      byDay.set(day, cur);
    }
    hasMore = rows.length === PAGE;
    from += PAGE;
  }
  return byDay;
}

/**
 * Daily breakdown for the super-admin operation drill-down.
 *
 * Spend comes from daily_totals_snapshot (authoritative, immutable), but
 * revenue/sales use MAX(snapshot, live sales_data aggregated in BRT).
 * COD operations (FAHTO) have snapshots with revenue = 0 because the snapshot
 * job never wrote COD revenue — the live aggregate closes that gap and keeps
 * digital ops (GTX/EDD) unchanged, since both sources match there.
 */
export function useOperationDailyBreakdown(
  opId: string | undefined,
  start: string,
  end: string,
  enabled = true,
) {
  return useQuery<OpDailyRow[]>({
    queryKey: ["op-daily-breakdown", opId, start, end],
    enabled: !!opId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: snaps, error }, salesByDay] = await Promise.all([
        supabase
          .from("daily_totals_snapshot")
          .select("date, total_spend, total_revenue, total_conversions")
          .eq("operation_id", opId!)
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: true }),
        fetchSalesByDay(opId!, start, end),
      ]);
      if (error) throw error;

      const days = new Set<string>([
        ...(snaps ?? []).map((s: any) => String(s.date)),
        ...salesByDay.keys(),
      ]);
      const snapByDay = new Map((snaps ?? []).map((s: any) => [String(s.date), s]));

      return [...days]
        .sort()
        .map((day) => {
          const s = snapByDay.get(day);
          const live = salesByDay.get(day);
          const spend = num(s?.total_spend);
          const revenue = Math.max(num(s?.total_revenue), num(live?.revenue));
          const sales = Math.max(num(s?.total_conversions), num(live?.sales));
          return {
            date: day,
            spend,
            revenue,
            sales,
            lucro: revenue - spend,
            roas: spend > 0 ? revenue / spend : 0,
          };
        });
    },
  });
}
