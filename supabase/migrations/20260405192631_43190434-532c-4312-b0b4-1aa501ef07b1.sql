DROP FUNCTION IF EXISTS public.get_creative_traffic_aggregated(date, date, uuid);
DROP FUNCTION IF EXISTS public.get_creative_traffic_aggregated(date, date);

CREATE OR REPLACE FUNCTION public.get_creative_traffic_aggregated(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(account_id text, campaign_name text, ad_name text, status text, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint, total_video_25_percent bigint, total_video_50_percent bigint, total_video_75_percent bigint, total_video_100_percent bigint, total_thruplays bigint, total_inline_link_clicks bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.account_id, t.campaign_name, t.ad_name,
    MAX(t.status) AS status,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.clicks), 0) AS total_clicks,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.video_3s_views), 0) AS total_video_3s_views,
    COALESCE(SUM(t.video_25_percent), 0) AS total_video_25_percent,
    COALESCE(SUM(t.video_50_percent), 0) AS total_video_50_percent,
    COALESCE(SUM(t.video_75_percent), 0) AS total_video_75_percent,
    COALESCE(SUM(t.video_100_percent), 0) AS total_video_100_percent,
    COALESCE(SUM(t.thruplays), 0) AS total_thruplays,
    COALESCE(SUM(t.inline_link_clicks), 0) AS total_inline_link_clicks
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.campaign_name, t.ad_name;
$function$;