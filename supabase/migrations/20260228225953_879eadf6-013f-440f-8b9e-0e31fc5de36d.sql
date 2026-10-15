
CREATE OR REPLACE FUNCTION public.get_traffic_aggregated(p_start_date date, p_end_date date)
RETURNS TABLE(
  account_id text,
  campaign_name text,
  adset_name text,
  ad_name text,
  status text,
  total_spend numeric,
  total_clicks bigint,
  total_impressions bigint,
  total_video_3s_views bigint,
  total_video_25_percent bigint,
  total_video_50_percent bigint,
  total_video_75_percent bigint,
  total_video_100_percent bigint,
  total_thruplays bigint,
  avg_cpc numeric,
  avg_cpm numeric,
  avg_ctr numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    t.account_id,
    t.campaign_name,
    t.adset_name,
    t.ad_name,
    t.status,
    COALESCE(SUM(t.spend), 0) AS total_spend,
    COALESCE(SUM(t.clicks), 0) AS total_clicks,
    COALESCE(SUM(t.impressions), 0) AS total_impressions,
    COALESCE(SUM(t.video_3s_views), 0) AS total_video_3s_views,
    COALESCE(SUM(t.video_25_percent), 0) AS total_video_25_percent,
    COALESCE(SUM(t.video_50_percent), 0) AS total_video_50_percent,
    COALESCE(SUM(t.video_75_percent), 0) AS total_video_75_percent,
    COALESCE(SUM(t.video_100_percent), 0) AS total_video_100_percent,
    COALESCE(SUM(t.thruplays), 0) AS total_thruplays,
    CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend) / SUM(t.clicks) ELSE 0 END AS avg_cpc,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend) / SUM(t.impressions)) * 1000 ELSE 0 END AS avg_cpm,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.clicks)::numeric / SUM(t.impressions)) * 100 ELSE 0 END AS avg_ctr
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
  GROUP BY t.account_id, t.campaign_name, t.adset_name, t.ad_name, t.status;
$$;
