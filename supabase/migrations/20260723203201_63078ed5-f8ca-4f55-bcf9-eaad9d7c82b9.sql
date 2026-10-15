DROP FUNCTION IF EXISTS public.get_traffic_aggregated(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_traffic_aggregated(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id text,
  campaign_name text,
  adset_name text,
  ad_name text,
  status text,
  date date,
  total_spend numeric,
  total_clicks numeric,
  total_impressions numeric,
  total_video_3s_views numeric,
  total_video_25_percent numeric,
  total_video_50_percent numeric,
  total_video_75_percent numeric,
  total_video_100_percent numeric,
  total_thruplays numeric,
  avg_cpc numeric,
  avg_cpm numeric,
  avg_ctr numeric,
  total_initiate_checkout numeric,
  total_inline_link_clicks numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_op_access(p_operation_id);

  RETURN QUERY
  SELECT
    t.account_id,
    t.campaign_name,
    t.adset_name,
    t.ad_name,
    t.status,
    t.date,
    COALESCE(SUM(t.spend), 0),
    COALESCE(SUM(t.clicks), 0),
    COALESCE(SUM(t.impressions), 0),
    COALESCE(SUM(t.video_3s_views), 0),
    COALESCE(SUM(t.video_25_percent), 0),
    COALESCE(SUM(t.video_50_percent), 0),
    COALESCE(SUM(t.video_75_percent), 0),
    COALESCE(SUM(t.video_100_percent), 0),
    COALESCE(SUM(t.thruplays), 0),
    CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend) / SUM(t.clicks) ELSE 0 END,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend) / SUM(t.impressions)) * 1000 ELSE 0 END,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.clicks)::numeric / SUM(t.impressions)) * 100 ELSE 0 END,
    COALESCE(SUM(t.initiate_checkout), 0),
    COALESCE(SUM(t.inline_link_clicks), 0)
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.campaign_name, t.adset_name, t.ad_name, t.status, t.date;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_traffic_aggregated(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_traffic_aggregated(date, date, uuid) TO service_role;