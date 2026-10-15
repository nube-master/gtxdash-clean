CREATE OR REPLACE FUNCTION public.get_creative_traffic_normalized_sp(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  account_id text,
  campaign_name text,
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
  total_inline_link_clicks bigint,
  total_initiate_checkout bigint,
  ad_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_op_access(p_operation_id);

  RETURN QUERY
  WITH
  brt_timezones AS (
    SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz
  ),
  sp_accounts AS (
    SELECT
      t.account_id AS acc,
      t.campaign_name AS cn,
      COALESCE(NULLIF(t.ad_name, '[OVERVIEW]'), m.name, '[OVERVIEW]') AS an,
      MAX(t.status) AS st,
      COALESCE(SUM(t.spend_brl), 0) AS spend,
      COALESCE(SUM(t.clicks), 0)::bigint AS clicks,
      COALESCE(SUM(t.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(t.video_3s_views), 0)::bigint AS v3s,
      COALESCE(SUM(t.video_25_percent), 0)::bigint AS v25,
      COALESCE(SUM(t.video_50_percent), 0)::bigint AS v50,
      COALESCE(SUM(t.video_75_percent), 0)::bigint AS v75,
      COALESCE(SUM(t.video_100_percent), 0)::bigint AS v100,
      COALESCE(SUM(t.thruplays), 0)::bigint AS tp,
      COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS ilc,
      COALESCE(SUM(COALESCE(t.fb_pixel_initiate_checkout, 0) + COALESCE(t.initiate_checkout, 0)), 0)::bigint AS ic,
      t.ad_id AS aid
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    LEFT JOIN meta_ad_status m ON t.ad_id = m.ad_id AND m.operation_id = t.operation_id
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.campaign_name, an, t.ad_id
  ),
  non_sp_hourly_by_date AS (
    SELECT
      h.account_id AS acc,
      (make_timestamp(extract(year from h.date)::int, extract(month from h.date)::int, extract(day from h.date)::int, h.hour, 30, 0) AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE a.timezone)::date AS local_date,
      h.date AS brt_date,
      SUM(h.spend_brl) AS hourly_spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON h.account_id = a.account_id AND a.is_active = true
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND h.date >= (p_start_date - 2) AND h.date <= (p_end_date + 2)
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY h.account_id, local_date, h.date
  ),
  non_sp_factors AS (
    SELECT
      acc,
      local_date,
      brt_date,
      CASE
        WHEN SUM(hourly_spend) OVER (PARTITION BY acc, local_date) > 0
          THEN hourly_spend / SUM(hourly_spend) OVER (PARTITION BY acc, local_date)
        ELSE 0
      END AS fraction
    FROM non_sp_hourly_by_date
  ),
  non_sp_factors_in_range AS (
    SELECT acc, local_date, SUM(fraction) AS in_range_fraction
    FROM non_sp_factors
    WHERE brt_date >= p_start_date AND brt_date <= p_end_date
    GROUP BY acc, local_date
  ),
  non_sp_hourly_coverage AS (
    SELECT DISTINCT acc, local_date FROM non_sp_hourly_by_date
  ),
  non_sp_rows AS (
    SELECT
      t.*,
      COALESCE(
        f.in_range_fraction,
        CASE
          WHEN c.acc IS NULL AND t.date >= p_start_date AND t.date <= p_end_date THEN 1
          ELSE 0
        END
      ) AS frac,
      COALESCE(NULLIF(t.ad_name, '[OVERVIEW]'), m.name, '[OVERVIEW]') AS an
    FROM traffic_data t
    JOIN meta_ad_accounts a ON t.account_id = a.account_id AND a.is_active = true
    LEFT JOIN non_sp_factors_in_range f ON f.acc = t.account_id AND f.local_date = t.date
    LEFT JOIN non_sp_hourly_coverage c ON c.acc = t.account_id AND c.local_date = t.date
    LEFT JOIN meta_ad_status m ON t.ad_id = m.ad_id AND m.operation_id = t.operation_id
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND t.date >= (p_start_date - 2) AND t.date <= (p_end_date + 2)
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
  ),
  non_sp_accounts AS (
    SELECT
      r.account_id AS acc,
      r.campaign_name AS cn,
      r.an AS an,
      MAX(r.status) AS st,
      COALESCE(SUM(r.spend_brl * r.frac), 0) AS spend,
      COALESCE(SUM(r.clicks * r.frac), 0)::bigint AS clicks,
      COALESCE(SUM(r.impressions * r.frac), 0)::bigint AS impressions,
      COALESCE(SUM(r.video_3s_views * r.frac), 0)::bigint AS v3s,
      COALESCE(SUM(r.video_25_percent * r.frac), 0)::bigint AS v25,
      COALESCE(SUM(r.video_50_percent * r.frac), 0)::bigint AS v50,
      COALESCE(SUM(r.video_75_percent * r.frac), 0)::bigint AS v75,
      COALESCE(SUM(r.video_100_percent * r.frac), 0)::bigint AS v100,
      COALESCE(SUM(r.thruplays * r.frac), 0)::bigint AS tp,
      COALESCE(SUM(r.inline_link_clicks * r.frac), 0)::bigint AS ilc,
      COALESCE(SUM((COALESCE(r.fb_pixel_initiate_checkout, 0) + COALESCE(r.initiate_checkout, 0)) * r.frac), 0)::bigint AS ic,
      r.ad_id AS aid
    FROM non_sp_rows r
    GROUP BY r.account_id, r.campaign_name, r.an, r.ad_id
  ),
  combined AS (
    SELECT * FROM sp_accounts
    UNION ALL
    SELECT * FROM non_sp_accounts
  ),
  keyed AS (
    SELECT
      *,
      COALESCE(
        (regexp_match(an, '\[(AD\s*0*\d{1,3}|VSL\s*0*\d{1,3}|TXT\s*0*\d{1,3})\]'))[1],
        (regexp_match(cn, '\[(AD\s*0*\d{1,3}|VSL\s*0*\d{1,3}|TXT\s*0*\d{1,3})\]'))[1],
        aid,
        an,
        cn
      ) AS creative_key
    FROM combined
  )
  SELECT
    string_agg(DISTINCT k.acc, ', ' ORDER BY k.acc) AS account_id,
    string_agg(DISTINCT k.cn, ' | ' ORDER BY k.cn) AS campaign_name,
    COALESCE(NULLIF(string_agg(DISTINCT k.an, ' | ' ORDER BY k.an), ''), '[OVERVIEW]') AS ad_name,
    MAX(k.st) AS status,
    SUM(k.spend) AS total_spend,
    SUM(k.clicks)::bigint AS total_clicks,
    SUM(k.impressions)::bigint AS total_impressions,
    SUM(k.v3s)::bigint AS total_video_3s_views,
    SUM(k.v25)::bigint AS total_video_25_percent,
    SUM(k.v50)::bigint AS total_video_50_percent,
    SUM(k.v75)::bigint AS total_video_75_percent,
    SUM(k.v100)::bigint AS total_video_100_percent,
    SUM(k.tp)::bigint AS total_thruplays,
    SUM(k.ilc)::bigint AS total_inline_link_clicks,
    SUM(k.ic)::bigint AS total_initiate_checkout,
    MIN(k.aid) AS ad_id
  FROM keyed k
  GROUP BY upper(regexp_replace(k.creative_key, '\s+', '', 'g'))
  HAVING SUM(k.spend) > 0 OR SUM(k.impressions) > 0;
END;
$function$;