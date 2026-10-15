import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useMobilePerformance, activePolling } from "@/hooks/useMobilePerformance";
import { useOperationId } from "@/contexts/OperationContext";

interface CreativeTrafficRow {
  account_id: string;
  campaign_name: string;
  ad_name: string;
  status: string;
  spend: number;
  clicks: number;
  inline_link_clicks: number;
  impressions: number;
  video_3s_views: number;
  video_25_percent: number;
  video_50_percent: number;
  video_75_percent: number;
  video_100_percent: number;
  thruplays: number;
  initiate_checkout: number;
  ad_id: string;
}

function mapRow(row: any): CreativeTrafficRow {
  return {
    account_id: row.account_id,
    campaign_name: row.campaign_name,
    ad_name: row.ad_name,
    status: row.status,
    // A RPC mantém o nome legado `total_spend`, mas o valor é sempre BRL
    // (SUM(spend_brl), inclusive no ramo normalizado por horário).
    spend: Number(row.total_spend),
    clicks: Number(row.total_clicks),
    inline_link_clicks: Number(row.total_inline_link_clicks ?? 0),
    impressions: Number(row.total_impressions),
    video_3s_views: Number(row.total_video_3s_views),
    video_25_percent: Number(row.total_video_25_percent),
    video_50_percent: Number(row.total_video_50_percent),
    video_75_percent: Number(row.total_video_75_percent),
    video_100_percent: Number(row.total_video_100_percent),
    thruplays: Number(row.total_thruplays),
    initiate_checkout: Number(row.total_initiate_checkout ?? 0),
    ad_id: row.ad_id,
  };
}

async function fetchCreativeTraffic(start: string, end: string, opId?: string | null): Promise<CreativeTrafficRow[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  const params: any = { p_start_date: start, p_end_date: end };
  if (opId) params.p_operation_id = opId;

  while (hasMore) {
    const { data, error } = await supabase
      .rpc("get_creative_traffic_normalized_sp", params)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }

  return all.map(mapRow);
}

export function useCreativeTrafficData() {
  const { dateRange } = useDateRange();
  const [start, end] = dateRange;
  const perf = useMobilePerformance();
  const opId = useOperationId();

  return useQuery({
    queryKey: ["creative-traffic", "brt-normalized-fx-v2", start, end, opId],
    queryFn: () => fetchCreativeTraffic(start, end, opId),
    refetchInterval: activePolling(perf.primaryPollingMs, perf.isTabActive),
    staleTime: perf.staleTimeMs,
  });
}
