CREATE OR REPLACE FUNCTION public.get_creative_traffic_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, campaign_name text, ad_name text, status text, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint, total_video_25_percent bigint, total_video_50_percent bigint, total_video_75_percent bigint, total_video_100_percent bigint, total_thruplays bigint, total_inline_link_clicks bigint, total_initiate_checkout bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
  WITH
  brt_timezones AS (SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz),
  sp_accounts AS (
    SELECT t.account_id AS acc, t.campaign_name AS cn, t.ad_name AS an, MAX(t.status) AS st,
      COALESCE(SUM(t.spend), 0) AS spend,
      COALESCE(SUM(t.clicks), 0)::bigint AS clicks,
      COALESCE(SUM(t.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(t.video_3s_views), 0)::bigint AS v3s,
      COALESCE(SUM(t.video_25_percent), 0)::bigint AS v25,
      COALESCE(SUM(t.video_50_percent), 0)::bigint AS v50,
      COALESCE(SUM(t.video_75_percent), 0)::bigint AS v75,
      COALESCE(SUM(t.video_100_percent), 0)::bigint AS v100,
      COALESCE(SUM(t.thruplays), 0)::bigint AS tp,
      COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS ilc,
      COALESCE(SUM(t.initiate_checkout), 0)::bigint AS ic
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.campaign_name, t.ad_name
  ),
  non_sp_hourly_by_date AS (
    SELECT h.account_id AS acc, h.date AS local_date,
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
    SELECT acc, local_date, brt_date,
      CASE WHEN SUM(hourly_spend) OVER (PARTITION BY acc, local_date) > 0
        THEN hourly_spend / SUM(hourly_spend) OVER (PARTITION BY acc, local_date)
        ELSE 0 END AS fraction
    FROM non_sp_hourly_by_date
  ),
  non_sp_factors_in_range AS (
    SELECT acc, local_date, SUM(fraction) AS in_range_fraction
    FROM non_sp_factors
    WHERE brt_date >= p_start_date AND brt_date <= p_end_date
    GROUP BY acc, local_date
  ),
  non_sp_accounts AS (
    SELECT t.account_id AS acc, t.campaign_name AS cn, t.ad_name AS an, MAX(t.status) AS st,
      COALESCE(SUM(t.spend * COALESCE(f.in_range_fraction, 0)), 0) AS spend,
      COALESCE(SUM(t.clicks * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS clicks,
      COALESCE(SUM(t.impressions * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS impressions,
      COALESCE(SUM(t.video_3s_views * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS v3s,
      COALESCE(SUM(t.video_25_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS v25,
      COALESCE(SUM(t.video_50_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS v50,
      COALESCE(SUM(t.video_75_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS v75,
      COALESCE(SUM(t.video_100_percent * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS v100,
      COALESCE(SUM(t.thruplays * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS tp,
      COALESCE(SUM(t.inline_link_clicks * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS ilc,
      COALESCE(SUM(t.initiate_checkout * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS ic
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    LEFT JOIN non_sp_factors_in_range f ON f.acc = t.account_id AND f.local_date = t.date
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND t.date >= (p_start_date - 2) AND t.date <= (p_end_date + 2)
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.campaign_name, t.ad_name
  ),
  combined AS (
    SELECT * FROM sp_accounts UNION ALL SELECT * FROM non_sp_accounts
  )
  SELECT c.acc, c.cn, c.an, MAX(c.st),
    SUM(c.spend), SUM(c.clicks)::bigint, SUM(c.impressions)::bigint,
    SUM(c.v3s)::bigint, SUM(c.v25)::bigint, SUM(c.v50)::bigint, SUM(c.v75)::bigint, SUM(c.v100)::bigint,
    SUM(c.tp)::bigint, SUM(c.ilc)::bigint, SUM(c.ic)::bigint
  FROM combined c
  GROUP BY c.acc, c.cn, c.an
  HAVING SUM(c.spend) > 0 OR SUM(c.impressions) > 0;
END;
$function$;