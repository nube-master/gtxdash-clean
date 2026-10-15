CREATE OR REPLACE FUNCTION public.get_traffic_aggregated(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, campaign_name text, adset_name text, ad_name text, status text, date date, total_spend numeric, total_clicks numeric, total_impressions numeric, total_video_3s_views numeric, total_video_25_percent numeric, total_video_50_percent numeric, total_video_75_percent numeric, total_video_100_percent numeric, total_thruplays numeric, avg_cpc numeric, avg_cpm numeric, avg_ctr numeric, total_inline_link_clicks numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT t.account_id, t.campaign_name, t.adset_name, t.ad_name, t.status, t.date,
    COALESCE(SUM(t.spend), 0), COALESCE(SUM(t.clicks), 0), COALESCE(SUM(t.impressions), 0),
    COALESCE(SUM(t.video_3s_views), 0), COALESCE(SUM(t.video_25_percent), 0),
    COALESCE(SUM(t.video_50_percent), 0), COALESCE(SUM(t.video_75_percent), 0),
    COALESCE(SUM(t.video_100_percent), 0), COALESCE(SUM(t.thruplays), 0),
    CASE WHEN SUM(t.clicks) > 0 THEN SUM(t.spend) / SUM(t.clicks) ELSE 0 END,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.spend) / SUM(t.impressions)) * 1000 ELSE 0 END,
    CASE WHEN SUM(t.impressions) > 0 THEN (SUM(t.clicks)::numeric / SUM(t.impressions)) * 100 ELSE 0 END,
    COALESCE(SUM(t.inline_link_clicks), 0)
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.campaign_name, t.adset_name, t.ad_name, t.status, t.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_traffic_by_campaign(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_name text, date date, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT t.campaign_name, t.date, COALESCE(SUM(t.spend), 0), COALESCE(SUM(t.clicks), 0),
    COALESCE(SUM(t.impressions), 0), COALESCE(SUM(t.video_3s_views), 0)
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.campaign_name, t.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_traffic_by_campaign_day(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_name text, date date, spend numeric, clicks bigint, impressions bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT t.campaign_name, t.date, SUM(t.spend), SUM(t.clicks), SUM(t.impressions)
  FROM traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.campaign_name, t.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_traffic_clicks_total(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(total_clicks bigint, total_impressions bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT COALESCE(SUM(t.clicks), 0)::bigint, COALESCE(SUM(t.impressions), 0)::bigint
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id);
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_traffic_spend_by_account(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, date date, total_spend numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
SELECT t.account_id, t.date, COALESCE(SUM(t.spend), 0)
  FROM public.traffic_data t
  WHERE t.date >= p_start_date AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.account_id, t.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_traffic_spend_by_account_normalized(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, date date, total_spend numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH brt_timezones AS (SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz),
  sp_accounts AS (
    SELECT t.account_id, t.date AS business_date, SUM(t.spend) AS spend
    FROM traffic_data t
    JOIN meta_ad_accounts a ON a.account_id = t.account_id AND a.is_active = true
    WHERE a.timezone IN (SELECT tz FROM brt_timezones)
      AND t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.date
  ),
  non_sp_accounts AS (
    SELECT h.account_id,
      (make_timestamp(extract(year from h.date)::int, extract(month from h.date)::int, extract(day from h.date)::int, h.hour, 30, 0) AT TIME ZONE a.timezone AT TIME ZONE 'America/Sao_Paulo')::date AS business_date,
      SUM(h.spend) AS spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON a.account_id = h.account_id AND a.is_active = true
    WHERE a.timezone NOT IN (SELECT tz FROM brt_timezones)
      AND h.date BETWEEN (p_start_date - 2) AND (p_end_date + 2)
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY h.account_id, business_date
  ),
  combined AS (
    SELECT account_id, business_date, spend FROM sp_accounts
    UNION ALL
    SELECT account_id, business_date, spend FROM non_sp_accounts
    WHERE business_date BETWEEN p_start_date AND p_end_date
  )
  SELECT account_id, business_date AS date, COALESCE(SUM(spend), 0) AS total_spend
  FROM combined
  WHERE business_date BETWEEN p_start_date AND p_end_date
  GROUP BY account_id, business_date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_vsl_advanced_metrics(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(vsl_id text, pitch_pct_weighted numeric, plays_total bigint, hook_rate_pct numeric, impressions_total bigint, video_3s_total bigint, offer_id uuid, offer_apelido text, offer_nicho text, bench_cpi_brl numeric, bench_conversion_pct numeric, bench_pitch_pct numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH pitch AS (
    SELECT v.vsl_id, SUM(v.plays)::bigint AS plays_total,
      CASE WHEN SUM(v.plays) > 0 THEN SUM(v.pitch_pct * v.plays) / NULLIF(SUM(v.plays), 0) END AS pitch_pct_weighted
    FROM vturb_performance_daily v
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.vsl_id
  ),
  vsl_camps AS (
    SELECT DISTINCT v.vsl_id, v.meta_campaign_id
    FROM vturb_performance_daily v
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
  ),
  cstatus AS (
    SELECT campaign_id, campaign_name FROM meta_campaign_status
    WHERE p_operation_id IS NULL OR operation_id = p_operation_id
  ),
  hook AS (
    SELECT vc.vsl_id, SUM(t.video_3s_views)::bigint AS v3s, SUM(t.impressions)::bigint AS imps
    FROM vsl_camps vc
    JOIN cstatus cs ON cs.campaign_id = vc.meta_campaign_id
    JOIN traffic_data t ON t.campaign_name = cs.campaign_name
      AND t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY vc.vsl_id
  ),
  vsl_offer AS (
    SELECT DISTINCT ON (v.vsl_id)
      v.vsl_id, o.id AS offer_id, o.apelido_interno, o.nicho::text AS nicho
    FROM vturb_performance_daily v
    JOIN offers o ON v.vsl_name ILIKE '%[' || o.apelido_interno || ']%'
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    ORDER BY v.vsl_id, length(o.apelido_interno) DESC
  ),
  bench AS (SELECT nicho::text AS nicho, cpi_brl, conversion_pct, pitch_retention_pct FROM offer_benchmarks)
  SELECT p.vsl_id, p.pitch_pct_weighted, p.plays_total,
    CASE WHEN COALESCE(h.imps,0) > 0 THEN (h.v3s::numeric / h.imps) * 100 END,
    COALESCE(h.imps, 0), COALESCE(h.v3s, 0),
    vo.offer_id, vo.apelido_interno, vo.nicho,
    b.cpi_brl, b.conversion_pct, b.pitch_retention_pct
  FROM pitch p
  LEFT JOIN hook h ON h.vsl_id = p.vsl_id
  LEFT JOIN vsl_offer vo ON vo.vsl_id = p.vsl_id
  LEFT JOIN bench b ON b.nicho = vo.nicho;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_vsl_retention_7d(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(vsl_id text, date date, retention_pct numeric, plays bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d)
  SELECT v.video_id AS vsl_id, v.date,
    CASE WHEN SUM(v.unique_views) > 0
      THEN (SUM(v.unique_views * v.retention_rate) / SUM(v.unique_views))::numeric
      ELSE 0 END AS retention_pct,
    SUM(v.unique_views)::bigint AS plays
  FROM public.vsl_data v
  WHERE v.date >= (SELECT d FROM today_brt) - 6
    AND v.date <= (SELECT d FROM today_brt)
    AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
  GROUP BY v.video_id, v.date
  ORDER BY v.video_id, v.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_vsl_spend_breakdown(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(vsl_id text, spend_brl numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH vturb_camp AS (
    SELECT v.vsl_id, v.date, v.meta_campaign_id, SUM(v.views)::numeric AS views
    FROM public.vturb_performance_daily v
    WHERE v.date >= p_start_date AND v.date <= p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.vsl_id, v.date, v.meta_campaign_id
  ),
  total_per_camp_day AS (
    SELECT date, meta_campaign_id, SUM(views) AS total_views
    FROM vturb_camp GROUP BY date, meta_campaign_id
  ),
  cstatus AS (
    SELECT campaign_id, campaign_name FROM public.meta_campaign_status
    WHERE p_operation_id IS NULL OR operation_id = p_operation_id
  ),
  traffic AS (
    SELECT t.campaign_name, t.date, SUM(t.spend) AS spend
    FROM public.traffic_data t
    WHERE t.date >= p_start_date AND t.date <= p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.campaign_name, t.date
  ),
  joined AS (
    SELECT vc.vsl_id, (vc.views / NULLIF(tpc.total_views, 0)) * COALESCE(tr.spend, 0) AS attributed_spend
    FROM vturb_camp vc
    JOIN total_per_camp_day tpc ON tpc.date = vc.date AND tpc.meta_campaign_id = vc.meta_campaign_id
    LEFT JOIN cstatus cs ON cs.campaign_id = vc.meta_campaign_id
    LEFT JOIN traffic tr ON tr.campaign_name = cs.campaign_name AND tr.date = vc.date
  )
  SELECT vsl_id, COALESCE(SUM(attributed_spend), 0)::numeric AS spend_brl
  FROM joined GROUP BY vsl_id;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_vsl_top_creatives(p_vsl_id text, p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 3)
RETURNS TABLE(ad_name text, campaign_name text, attributed_spend_brl numeric, total_spend_brl numeric, impressions bigint, link_clicks bigint, share_pct numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH vturb_camp AS (
    SELECT v.date, v.meta_campaign_id, SUM(v.views)::numeric AS views
    FROM public.vturb_performance_daily v
    WHERE v.vsl_id = p_vsl_id
      AND v.date BETWEEN p_start_date AND p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.date, v.meta_campaign_id
  ),
  total_views_camp AS (
    SELECT v.date, v.meta_campaign_id, SUM(v.views)::numeric AS total_views
    FROM public.vturb_performance_daily v
    WHERE v.date BETWEEN p_start_date AND p_end_date
      AND v.meta_campaign_id IS NOT NULL
      AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY v.date, v.meta_campaign_id
  ),
  cstatus AS (
    SELECT campaign_id, campaign_name FROM public.meta_campaign_status
    WHERE p_operation_id IS NULL OR operation_id = p_operation_id
  ),
  traffic_ads AS (
    SELECT t.campaign_name, t.ad_name, t.date,
      SUM(t.spend) AS spend, SUM(t.impressions) AS imps, SUM(t.inline_link_clicks) AS clicks
    FROM public.traffic_data t
    WHERE t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY t.campaign_name, t.ad_name, t.date
  ),
  joined AS (
    SELECT ta.ad_name, ta.campaign_name,
      (vc.views / NULLIF(tv.total_views, 0)) * ta.spend AS attr_spend,
      ta.spend AS total_spend,
      ((vc.views / NULLIF(tv.total_views, 0)) * ta.imps)::bigint AS attr_imps,
      ((vc.views / NULLIF(tv.total_views, 0)) * ta.clicks)::bigint AS attr_clicks,
      vc.views / NULLIF(tv.total_views, 0) AS share
    FROM vturb_camp vc
    JOIN total_views_camp tv ON tv.date = vc.date AND tv.meta_campaign_id = vc.meta_campaign_id
    JOIN cstatus cs ON cs.campaign_id = vc.meta_campaign_id
    JOIN traffic_ads ta ON ta.campaign_name = cs.campaign_name AND ta.date = vc.date
  )
  SELECT j.ad_name, MAX(j.campaign_name) AS campaign_name,
    COALESCE(SUM(j.attr_spend), 0)::numeric AS attributed_spend_brl,
    COALESCE(SUM(j.total_spend), 0)::numeric AS total_spend_brl,
    COALESCE(SUM(j.attr_imps), 0)::bigint AS impressions,
    COALESCE(SUM(j.attr_clicks), 0)::bigint AS link_clicks,
    (AVG(j.share) * 100)::numeric AS share_pct
  FROM joined j
  WHERE j.ad_name IS NOT NULL
  GROUP BY j.ad_name
  ORDER BY attributed_spend_brl DESC
  LIMIT p_limit;
END;
$FN$;