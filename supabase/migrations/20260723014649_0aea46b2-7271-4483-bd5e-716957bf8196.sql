ALTER TABLE public.traffic_data
  ADD COLUMN IF NOT EXISTS initiate_checkout bigint NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.get_creative_traffic_normalized_sp(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_creative_traffic_normalized_sp(
  p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id text, campaign_name text, ad_name text, status text,
  total_spend numeric, total_clicks bigint, total_impressions bigint,
  total_video_3s_views bigint, total_video_25_percent bigint,
  total_video_50_percent bigint, total_video_75_percent bigint,
  total_video_100_percent bigint, total_thruplays bigint,
  total_inline_link_clicks bigint, total_initiate_checkout bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH
  brt_timezones AS (SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz),
  sp_accounts AS (
    SELECT t.account_id, t.campaign_name, t.ad_name, MAX(t.status) AS status,
      COALESCE(SUM(t.spend), 0) AS spend, COALESCE(SUM(t.clicks), 0) AS clicks,
      COALESCE(SUM(t.impressions), 0) AS impressions,
      COALESCE(SUM(t.video_3s_views), 0) AS video_3s_views,
      COALESCE(SUM(t.video_25_percent), 0) AS video_25_percent,
      COALESCE(SUM(t.video_50_percent), 0) AS video_50_percent,
      COALESCE(SUM(t.video_75_percent), 0) AS video_75_percent,
      COALESCE(SUM(t.video_100_percent), 0) AS video_100_percent,
      COALESCE(SUM(t.thruplays), 0) AS thruplays,
      COALESCE(SUM(t.inline_link_clicks), 0) AS inline_link_clicks,
      COALESCE(SUM(t.initiate_checkout), 0) AS initiate_checkout
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.campaign_name, t.ad_name
  ),
  non_sp_hourly_by_date AS (
    SELECT h.account_id, h.date AS local_date,
      (make_timestamp(extract(year from h.date)::int, extract(month from h.date)::int, extract(day from h.date)::int, h.hour, 30, 0) AT TIME ZONE a.timezone AT TIME ZONE 'America/Sao_Paulo')::date AS brt_date,
      SUM(h.spend) AS hourly_spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON h.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND h.date >= (p_start_date - 2) AND h.date <= (p_end_date + 2)
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY h.account_id, h.date, brt_date
  ),
  non_sp_factors AS (
    SELECT account_id, local_date, brt_date,
      CASE WHEN SUM(hourly_spend) OVER (PARTITION BY account_id, local_date) > 0
        THEN hourly_spend / SUM(hourly_spend) OVER (PARTITION BY account_id, local_date)
        ELSE 0 END AS fraction
    FROM non_sp_hourly_by_date
  ),
  non_sp_factors_in_range AS (
    SELECT account_id, local_date, SUM(fraction) AS in_range_fraction
    FROM non_sp_factors
    WHERE brt_date >= p_start_date AND brt_date <= p_end_date
    GROUP BY account_id, local_date
  ),
  non_sp_accounts AS (
    SELECT t.account_id, t.campaign_name, t.ad_name, MAX(t.status) AS status,
      COALESCE(SUM(t.spend * COALESCE(f.in_range_fraction, 0)), 0) AS spend,
      COALESCE(SUM(t.clicks * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS clicks,
      COALESCE(SUM(t.impressions * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS impressions,
      COALESCE(SUM(t.video_3s_views * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS video_3s_views,
      COALESCE(SUM(t.video_25_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS video_25_percent,
      COALESCE(SUM(t.video_50_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS video_50_percent,
      COALESCE(SUM(t.video_75_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS video_75_percent,
      COALESCE(SUM(t.video_100_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS video_100_percent,
      COALESCE(SUM(t.thruplays * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS thruplays,
      COALESCE(SUM(t.inline_link_clicks * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS inline_link_clicks,
      COALESCE(SUM(t.initiate_checkout * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS initiate_checkout
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    LEFT JOIN non_sp_factors_in_range f ON f.account_id = t.account_id AND f.local_date = t.date
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND t.date >= (p_start_date - 2) AND t.date <= (p_end_date + 2)
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.campaign_name, t.ad_name
  ),
  combined AS (SELECT * FROM sp_accounts UNION ALL SELECT * FROM non_sp_accounts)
  SELECT c.account_id, c.campaign_name, c.ad_name, MAX(c.status) AS status,
    SUM(c.spend) AS total_spend, SUM(c.clicks)::bigint AS total_clicks,
    SUM(c.impressions)::bigint AS total_impressions,
    SUM(c.video_3s_views)::bigint AS total_video_3s_views,
    SUM(c.video_25_percent)::bigint AS total_video_25_percent,
    SUM(c.video_50_percent)::bigint AS total_video_50_percent,
    SUM(c.video_75_percent)::bigint AS total_video_75_percent,
    SUM(c.video_100_percent)::bigint AS total_video_100_percent,
    SUM(c.thruplays)::bigint AS total_thruplays,
    SUM(c.inline_link_clicks)::bigint AS total_inline_link_clicks,
    SUM(c.initiate_checkout)::bigint AS total_initiate_checkout
  FROM combined c
  GROUP BY c.account_id, c.campaign_name, c.ad_name
  HAVING SUM(c.spend) > 0 OR SUM(c.impressions) > 0;
END;
$FN$;

REVOKE EXECUTE ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_creative_traffic_normalized_sp(date, date, uuid) TO authenticated, service_role;