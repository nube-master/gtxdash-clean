import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

/** Canonical query key for traffic_data — used by all consumers */
export const trafficQueryKey = (start: string, end: string, opId?: string | null) =>
  ["traffic-data", start, end, opId] as const;

function mapAggregatedRow(row: any) {
  return {
    account_id: row.account_id,
    campaign_name: row.campaign_name,
    adset_name: row.adset_name,
    ad_name: row.ad_name,
    status: row.status,
    date: row.date,
    spend: Number(row.total_spend),
    clicks: Number(row.total_clicks),
    impressions: Number(row.total_impressions),
    initiate_checkout: Number(row.total_initiate_checkout || 0),
    landing_page_views: Number(row.total_landing_page_views || 0),
    inline_link_clicks: Number(row.total_inline_link_clicks || 0),
    video_3s_views: Number(row.total_video_3s_views),
    video_25_percent: Number(row.total_video_25_percent),
    video_50_percent: Number(row.total_video_50_percent),
    video_75_percent: Number(row.total_video_75_percent),
    video_100_percent: Number(row.total_video_100_percent),
    thruplays: Number(row.total_thruplays),
    cpc: Number(row.avg_cpc),
    cpm: Number(row.avg_cpm),
    ctr: Number(row.avg_ctr),
    id: `${row.account_id}-${row.campaign_name}-${row.ad_name}-${row.date}`,
  };
}

async function fetchTrafficAggregated(start: string, end: string, opId?: string | null) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  const params: any = { p_start_date: start, p_end_date: end };
  if (opId) params.p_operation_id = opId;

  while (hasMore) {
    const { data, error } = await supabase
      .rpc("get_traffic_aggregated", params)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }

  return all.map(mapAggregatedRow);
}

export function useTrafficData() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: trafficQueryKey(start, end, opId),
    queryFn: () => fetchTrafficAggregated(start, end, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}

/** Standalone fetcher for use by other hooks (e.g., usePreviousPeriodData) */
export { fetchTrafficAggregated };
