import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOperationId } from "@/contexts/OperationContext";
import { useDashboardTotals, type DashboardTotals } from "@/hooks/useDashboardTotals";

function getTodaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function useMarketPulseData() {
  const today = getTodaySP();
  const start3 = subtractDays(today, 2);
  const start7 = subtractDays(today, 6);
  const operationId = useOperationId();

  // Use dashboard-totals as the authoritative source for today
  const { data: skyTotals } = useDashboardTotals();

  return useQuery({
    queryKey: ["market-pulse", today, operationId, skyTotals?.totalRevenue, skyTotals?.totalSpend],
    queryFn: async () => {
      // TODAY: use dashboard-totals (North Star) directly
      const todayRevenue = skyTotals?.totalRevenue ?? 0;
      const todaySpend = skyTotals?.totalSpend ?? 0;
      const roasToday = todaySpend > 0 ? todayRevenue / todaySpend : 0;
      const lucroToday = todayRevenue - todaySpend;

      // HISTORICAL: fetch snapshots for past days to compute 3d and 7d metrics
      const yesterday = subtractDays(today, 1);
      let q = supabase
        .from("daily_totals_snapshot")
        .select("date, total_revenue, total_spend")
        .gte("date", start7)
        .lte("date", yesterday)
        .order("date");
      if (operationId) q = q.eq("operation_id", operationId);

      const { data: snapshots } = await q;

      const dailyRevenue = new Map<string, number>();
      const dailySpend = new Map<string, number>();

      // Add historical days from snapshots
      for (const row of (snapshots || [])) {
        dailyRevenue.set(row.date, Number(row.total_revenue || 0));
        dailySpend.set(row.date, Number(row.total_spend || 0));
      }

      // Add today from dashboard-totals
      dailyRevenue.set(today, todayRevenue);
      dailySpend.set(today, todaySpend);

      // 3-day metrics
      let revenue3 = 0, spend3 = 0;
      for (const [d, rev] of dailyRevenue) {
        if (d >= start3) {
          revenue3 += rev;
          spend3 += dailySpend.get(d) || 0;
        }
      }
      const roas3 = spend3 > 0 ? revenue3 / spend3 : 0;

      // 7-day average
      let revenue7 = 0, spend7 = 0;
      for (const [, rev] of dailyRevenue) revenue7 += rev;
      for (const [, sp] of dailySpend) spend7 += sp;
      const avgDailyRevenue7 = revenue7 / 7;
      const avgDailySpend7 = spend7 / 7;
      const avgDailyLucro7 = avgDailyRevenue7 - avgDailySpend7;

      const variationVsAvg7 = avgDailyLucro7 !== 0
        ? ((lucroToday - avgDailyLucro7) / Math.abs(avgDailyLucro7)) * 100
        : lucroToday > 0 ? 100 : 0;

      const riskFactors = [
        roasToday < 1 ? 2 : roasToday < 1.5 ? 1 : 0,
        lucroToday < 0 ? 2 : lucroToday < avgDailyLucro7 * 0.5 ? 1 : 0,
        roas3 < 1 ? 1 : 0,
      ];
      const riskScore = riskFactors.reduce((s, f) => s + f, 0);
      const riskLevel: "baixo" | "medio" | "alto" = riskScore >= 3 ? "alto" : riskScore >= 2 ? "medio" : "baixo";

      return {
        roasToday,
        roas3,
        lucroToday,
        variationVsAvg7,
        riskLevel,
        todayRevenue,
        todaySpend,
      };
    },
    enabled: !!skyTotals,
    refetchInterval: 300_000,
  });
}
