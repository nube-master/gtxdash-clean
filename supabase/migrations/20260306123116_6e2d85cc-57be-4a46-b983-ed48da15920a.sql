
CREATE OR REPLACE FUNCTION public.get_traffic_by_campaign(p_start_date date, p_end_date date)
RETURNS TABLE(
  campaign_name text,
  date date,
  total_spend numeric,
  total_clicks bigint,
  total_impressions bigint,
  total_video_3s_views bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    t.campaign_name,
    t.date,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.clicks), 0) AS total_clicks,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.video_3s_views), 0) AS total_video_3s_views
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
  GROUP BY t.campaign_name, t.date;
$$;
