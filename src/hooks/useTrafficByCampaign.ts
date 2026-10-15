import { useQuery } from "@tanstack/react-query";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";
import { fetchTrafficAggregated } from "@/hooks/useTrafficData";

async function fetchTrafficByCampaign(start: string, end: string, opId?: string | null) {
  const rows = await fetchTrafficAggregated(start, end, opId);
  const grouped = new Map<string, any>();

  for (const row of rows) {
    const key = `${row.campaign_name}-${row.date}`;
    const current = grouped.get(key) || {
      campaign_name: row.campaign_name,
      date: row.date,
      spend: 0,
      clicks: 0,
      impressions: 0,
      initiate_checkout: 0,
      inline_link_clicks: 0,
      video_3s_views: 0,
      id: key,
    };

    current.spend += Number(row.spend || 0);
    current.clicks += Number(row.clicks || 0);
    current.impressions += Number(row.impressions || 0);
    current.initiate_checkout += Number(row.initiate_checkout || 0);
    current.inline_link_clicks += Number(row.inline_link_clicks || 0);
    current.video_3s_views += Number(row.video_3s_views || 0);

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
}

export function useTrafficByCampaign() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["traffic-by-campaign", "v2", start, end, opId],
    queryFn: () => fetchTrafficByCampaign(start, end, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}

export { fetchTrafficByCampaign };
