import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCreativeId } from "@/lib/creativeUtils";
import {
  extractProjectCodeFromNaming,
  resolveProjectCodeWithFallback,
  toCreativeCompositeKey,
} from "@/lib/projectUtils";
import { useAccountStatuses } from "@/hooks/useAccountStatuses";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

/** Returns YYYY-MM-DD in São Paulo timezone */
function toBRDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function getLast3Days(): [string, string] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 2); // today + 2 days back = 3 days
  return [toBRDate(start), toBRDate(now)];
}

async function fetchTraffic3d(start: string, end: string, operationId?: string | null) {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const params: {
      p_start_date: string;
      p_end_date: string;
      p_operation_id?: string;
    } = {
      p_start_date: start,
      p_end_date: end,
    };
    if (operationId) params.p_operation_id = operationId;

    const { data, error } = await supabase
      .rpc("get_traffic_aggregated", params)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  // Map to expected shape
  return all.map((r: any) => ({
    campaign_name: r.campaign_name,
    ad_name: r.ad_name,
    date: r.date,
    spend: Number(r.total_spend),
    impressions: Number(r.total_impressions),
    video_3s_views: Number(r.total_video_3s_views),
  }));
}

async function fetchSales3d(start: string, end: string, operationId?: string | null) {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabase
      .from("sales_data")
      .select("*")
      .gte("date", start)
      .lte("date", end);
    if (operationId) query = query.eq("operation_id", operationId);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    hasMore = (data?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}

export interface Creative3DayData {
  avgRoi: number;
  profitPositiveAllDays: boolean;
  totalSales: number;
  daysWithData: number;
  hookRate: number;
}

/**
 * Fetches last 3 days of traffic + sales and computes per-creative rolling metrics.
 * This is independent of the global date range filter.
 */
export function useCreative3DayPerformance() {
  const [start, end] = getLast3Days();
  const { data: accounts } = useAccountStatuses();
  const perf = useMobilePerformance();
  const operationId = useOperationId();

  const currencyMap = useMemo(() => {
    const map = new Map<string, string>();
    (accounts || []).forEach((a: any) => map.set(a.account_id, a.currency));
    return map;
  }, [accounts]);

  const { data: trafficData } = useQuery({
    queryKey: ["traffic-3d", "fx-v2", start, end, operationId],
    queryFn: () => fetchTraffic3d(start, end, operationId),
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });

  const { data: salesData } = useQuery({
    queryKey: ["sales-3d", start, end, operationId],
    queryFn: () => fetchSales3d(start, end, operationId),
    refetchInterval: activePolling(perf.secondaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });

  const performance = useMemo(() => {
    const map = new Map<string, Creative3DayData>();
    if (!trafficData || !salesData) return map;

    // Group traffic by creative_id + date
    const dailyMap = new Map<string, Map<string, { spend: number; revenue: number; impressions: number; video3s: number; sales: number }>>();

    for (const t of trafficData) {
      const cid = resolveCreativeId(t.campaign_name);
      const projectCode = resolveProjectCodeWithFallback(t.campaign_name, t.ad_name);
      const compositeKey = toCreativeCompositeKey(cid, projectCode);
      if (!dailyMap.has(compositeKey)) dailyMap.set(compositeKey, new Map());
      const dayMap = dailyMap.get(compositeKey)!;
      if (!dayMap.has(t.date)) dayMap.set(t.date, { spend: 0, revenue: 0, impressions: 0, video3s: 0, sales: 0 });
      const d = dayMap.get(t.date)!;
      d.spend += Number(t.spend);
      d.impressions += Number(t.impressions);
      d.video3s += Number(t.video_3s_views);
    }

    const approvedSales = salesData.filter((s: any) => s.status === "approved");
    for (const sale of approvedSales) {
      const cid = resolveCreativeId(sale.utm_campaign);
      const projectCode = extractProjectCodeFromNaming(sale.utm_campaign);
      const compositeKey = toCreativeCompositeKey(cid, projectCode);
      if (!dailyMap.has(compositeKey)) dailyMap.set(compositeKey, new Map());
      const dayMap = dailyMap.get(compositeKey)!;
      if (!dayMap.has(sale.date)) dayMap.set(sale.date, { spend: 0, revenue: 0, impressions: 0, video3s: 0, sales: 0 });
      const d = dayMap.get(sale.date)!;
      d.revenue += Number(sale.revenue);
      d.sales++;
    }

    // Keep true "Sem Tag" entries isolated when the campaign naming has no project tag.

    // Compute 3-day metrics per creative
    for (const [cid, dayMap] of dailyMap) {
      let totalSpend = 0, totalRevenue = 0, totalImpressions = 0, totalVideo3s = 0, totalSales = 0;
      let profitPositiveAllDays = true;
      let daysWithData = 0;

      for (const [, day] of dayMap) {
        totalSpend += day.spend;
        totalRevenue += day.revenue;
        totalImpressions += day.impressions;
        totalVideo3s += day.video3s;
        totalSales += day.sales;
        if (day.spend > 0) {
          daysWithData++;
          if (day.revenue - day.spend < 0) profitPositiveAllDays = false;
        }
      }

      const avgRoi = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      const hookRate = totalImpressions > 0 ? (totalVideo3s / totalImpressions) * 100 : 0;

      map.set(cid, {
        avgRoi,
        profitPositiveAllDays,
        totalSales,
        daysWithData,
        hookRate,
      });
    }

    return map;
  }, [trafficData, salesData, currencyMap]);

  return performance;
}
