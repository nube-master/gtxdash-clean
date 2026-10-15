CREATE OR REPLACE FUNCTION public.get_creative_traffic_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(account_id text, campaign_name text, ad_name text, status text, total_spend numeric, total_clicks bigint, total_impressions bigint, total_video_3s_views bigint, total_video_25_percent bigint, total_video_50_percent bigint, total_video_75_percent bigint, total_video_100_percent bigint, total_thruplays bigint, total_inline_link_clicks bigint)
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
      COALESCE(SUM(t.inline_link_clicks), 0) AS inline_link_clicks
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
      COALESCE(SUM(t.inline_link_clicks * COALESCE(f.in_range_fraction, 0)), 0)::bigint AS inline_link_clicks
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
    SUM(c.inline_link_clicks)::bigint AS total_inline_link_clicks
  FROM combined c
  GROUP BY c.account_id, c.campaign_name, c.ad_name
  HAVING SUM(c.spend) > 0 OR SUM(c.impressions) > 0;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_live_pacing_campaigns(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(campaign_id text, campaign_name text, account_id text, account_name text, status text, effective_status text, daily_budget numeric, spend_today numeric, spend_yesterday numeric, impressions_today bigint, clicks_today bigint, sales_today bigint, revenue_today numeric, sales_yesterday bigint, revenue_yesterday numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  active_accounts AS (
    SELECT account_id, account_name FROM public.meta_ad_accounts
    WHERE is_active = true AND 1=1
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (s.account_id, s.campaign_id)
      s.account_id, s.campaign_id, s.campaign_name,
      s.spend_today_brl::numeric AS spend, s.revenue_today_brl::numeric AS revenue,
      s.impressions_today::bigint AS impressions,
      COALESCE(NULLIF(s.link_clicks_today,0), s.clicks_today)::bigint AS clicks,
      s.snapshot_at
    FROM public.pacing_campaign_hourly_snapshots s, t
    WHERE s.date = t.d AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    ORDER BY s.account_id, s.campaign_id, s.snapshot_at DESC
  ),
  snap_by_name AS (
    SELECT account_id, campaign_name, SUM(spend)::numeric AS spend,
      SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks
    FROM latest_snapshots GROUP BY account_id, campaign_name
  ),
  td_today_raw AS (
    SELECT td.account_id, td.campaign_name, SUM(td.spend)::numeric AS spend,
      SUM(td.impressions)::bigint AS impressions, SUM(td.inline_link_clicks)::bigint AS clicks
    FROM public.traffic_data td, t
    WHERE td.date = t.d AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
    GROUP BY td.account_id, td.campaign_name
  ),
  td_today AS (
    SELECT tr.account_id, tr.campaign_name,
      CASE WHEN COALESCE(sb.spend,0) > tr.spend THEN sb.spend ELSE tr.spend END::numeric AS spend,
      GREATEST(COALESCE(sb.impressions,0), tr.impressions)::bigint AS impressions,
      GREATEST(COALESCE(sb.clicks,0), tr.clicks)::bigint AS clicks
    FROM td_today_raw tr
    LEFT JOIN snap_by_name sb ON sb.account_id=tr.account_id AND sb.campaign_name=tr.campaign_name
  ),
  td_yest AS (
    SELECT td.account_id, td.campaign_name, SUM(td.spend)::numeric AS spend
    FROM public.traffic_data td, t
    WHERE td.date = t.d - 1 AND (p_operation_id IS NULL OR td.operation_id = p_operation_id)
    GROUP BY td.account_id, td.campaign_name
  ),
  s_today AS (
    SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
    FROM public.resolve_pacing_sales_attribution((SELECT d FROM t))
    WHERE campaign_id IS NOT NULL GROUP BY campaign_id
  ),
  s_yest AS (
    SELECT campaign_id, SUM(sales)::bigint AS sales, SUM(revenue)::numeric AS revenue
    FROM public.resolve_pacing_sales_attribution((SELECT d FROM t) - 1)
    WHERE campaign_id IS NOT NULL GROUP BY campaign_id
  ),
  mcs_filtered AS (
    SELECT * FROM public.meta_campaign_status
    WHERE COALESCE(UPPER(effective_status), UPPER(status), '') NOT IN ('ARCHIVED', 'DELETED')
      AND COALESCE(UPPER(status), '') NOT IN ('ARCHIVED', 'DELETED')
  ),
  mcs_scored AS (
    SELECT mcs.*,
      ROW_NUMBER() OVER (
        PARTITION BY mcs.account_id, mcs.campaign_id
        ORDER BY
          CASE WHEN mcs.status='ACTIVE' OR mcs.effective_status='ACTIVE' THEN 0
               WHEN mcs.status='PAUSED' OR mcs.effective_status='PAUSED' THEN 1
               WHEN mcs.status='UNKNOWN' OR mcs.effective_status='UNKNOWN' THEN 2
               ELSE 3 END,
          COALESCE(s_today.sales,0) DESC,
          COALESCE(ls.spend, td_today.spend, 0) DESC,
          COALESCE(NULLIF(mcs.daily_budget,0), mcs.lifetime_budget, 0) DESC,
          mcs.updated_at DESC NULLS LAST, mcs.campaign_id
      ) AS rn
    FROM mcs_filtered mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
    LEFT JOIN latest_snapshots ls ON ls.account_id=mcs.account_id AND ls.campaign_id=mcs.campaign_id
    LEFT JOIN td_today ON td_today.account_id=mcs.account_id AND td_today.campaign_name=mcs.campaign_name
    LEFT JOIN td_yest ON td_yest.account_id=mcs.account_id AND td_yest.campaign_name=mcs.campaign_name
    LEFT JOIN s_today ON s_today.campaign_id = mcs.campaign_id
    WHERE (p_operation_id IS NULL OR mcs.operation_id = p_operation_id)
      AND (mcs.status='ACTIVE' OR mcs.effective_status='ACTIVE'
           OR COALESCE(ls.spend, 0) > 0 OR COALESCE(s_today.sales, 0) > 0
           OR ((mcs.status='PAUSED' OR mcs.effective_status='PAUSED') AND COALESCE(td_yest.spend, 0) > 0))
  ),
  mcs_dedup AS (SELECT * FROM mcs_scored WHERE rn = 1),
  base AS (
    SELECT mcs.campaign_id, mcs.campaign_name, mcs.account_id, aa.account_name,
      mcs.status, mcs.effective_status,
      COALESCE(NULLIF(mcs.daily_budget,0), mcs.lifetime_budget, 0) AS daily_budget,
      COALESCE(ls.spend, 0) AS spend_today,
      COALESCE(td_yest.spend, 0) AS spend_yesterday,
      COALESCE(ls.impressions, 0)::bigint AS impressions_today,
      COALESCE(ls.clicks, 0)::bigint AS clicks_today,
      COALESCE(s_today.sales, 0) AS sales_today,
      COALESCE(s_today.revenue, 0) AS revenue_today,
      COALESCE(s_yest.sales, 0) AS sales_yesterday,
      COALESCE(s_yest.revenue, 0) AS revenue_yesterday
    FROM mcs_dedup mcs
    JOIN active_accounts aa ON aa.account_id = mcs.account_id
    LEFT JOIN latest_snapshots ls ON ls.account_id=mcs.account_id AND ls.campaign_id=mcs.campaign_id
    LEFT JOIN td_yest ON td_yest.account_id=mcs.account_id AND td_yest.campaign_name=mcs.campaign_name
    LEFT JOIN s_today ON s_today.campaign_id = mcs.campaign_id
    LEFT JOIN s_yest ON s_yest.campaign_id = mcs.campaign_id
  ),
  base_with_td_delta AS (
    SELECT b.*,
      GREATEST(b.spend_today,
        CASE WHEN b.campaign_id = FIRST_VALUE(b.campaign_id) OVER (PARTITION BY b.account_id, b.campaign_name ORDER BY b.spend_today DESC, b.campaign_id)
             THEN COALESCE(td.spend, 0) - COALESCE(SUM(b.spend_today) OVER (PARTITION BY b.account_id, b.campaign_name), 0) + b.spend_today
             ELSE b.spend_today END) AS spend_today_adjusted,
      GREATEST(b.impressions_today, COALESCE(td.impressions, 0))::bigint AS impressions_today_adj,
      GREATEST(b.clicks_today, COALESCE(td.clicks, 0))::bigint AS clicks_today_adj
    FROM base b
    LEFT JOIN td_today td ON td.account_id=b.account_id AND td.campaign_name=b.campaign_name
  ),
  base_final AS (
    SELECT campaign_id, campaign_name, account_id, account_name, status, effective_status, daily_budget,
      spend_today_adjusted AS spend_today, spend_yesterday,
      impressions_today_adj AS impressions_today, clicks_today_adj AS clicks_today,
      sales_today, revenue_today, sales_yesterday, revenue_yesterday
    FROM base_with_td_delta
  ),
  snapshot_orphans AS (
    SELECT ls.campaign_id, ls.campaign_name, ls.account_id, aa.account_name,
      COALESCE(mcs.status, 'UNKNOWN')::text AS status,
      COALESCE(mcs.effective_status, mcs.status)::text AS effective_status,
      COALESCE(NULLIF(mcs.daily_budget,0), mcs.lifetime_budget, 0)::numeric AS daily_budget,
      ls.spend AS spend_today,
      COALESCE(td_yest.spend, 0) AS spend_yesterday,
      COALESCE(ls.impressions,0)::bigint AS impressions_today,
      COALESCE(ls.clicks,0)::bigint AS clicks_today,
      COALESCE(s_today.sales, 0)::bigint AS sales_today,
      COALESCE(ls.revenue, s_today.revenue, 0)::numeric AS revenue_today,
      COALESCE(s_yest.sales, 0)::bigint AS sales_yesterday,
      COALESCE(s_yest.revenue, 0)::numeric AS revenue_yesterday
    FROM latest_snapshots ls
    JOIN active_accounts aa ON aa.account_id = ls.account_id
    LEFT JOIN public.meta_campaign_status mcs ON mcs.account_id = ls.account_id AND mcs.campaign_id = ls.campaign_id
    LEFT JOIN td_yest ON td_yest.account_id=ls.account_id AND td_yest.campaign_name=ls.campaign_name
    LEFT JOIN s_today ON s_today.campaign_id = ls.campaign_id
    LEFT JOIN s_yest ON s_yest.campaign_id = ls.campaign_id
    WHERE ls.spend > 0
      AND COALESCE(UPPER(mcs.effective_status), UPPER(mcs.status), '') NOT IN ('ARCHIVED', 'DELETED')
      AND NOT EXISTS (SELECT 1 FROM base_final b WHERE b.campaign_id = ls.campaign_id)
  )
  SELECT * FROM base_final UNION ALL SELECT * FROM snapshot_orphans;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_live_viewers_heatmap(p_since timestamp with time zone, p_player_id text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_ad_id text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid, p_operation_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(dow integer, hour integer, viewers bigint, samples bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access_array(COALESCE(p_operation_ids, ARRAY[p_operation_id]));
  RETURN QUERY
WITH base AS (
    SELECT session_id, (started_at AT TIME ZONE 'America/Sao_Paulo') AS brt_ts
    FROM public.live_viewers
    WHERE started_at >= p_since
      AND (p_player_id IS NULL OR player_id = p_player_id)
      AND (p_product IS NULL OR product = p_product)
      AND (p_ad_id IS NULL OR ad_id = p_ad_id)
      AND (p_operation_id IS NOT NULL AND operation_id = p_operation_id
           OR p_operation_id IS NULL AND (p_operation_ids IS NULL OR operation_id = ANY(p_operation_ids)))
  )
  SELECT EXTRACT(DOW FROM brt_ts)::int AS dow, EXTRACT(HOUR FROM brt_ts)::int AS hour,
    COUNT(DISTINCT session_id)::bigint AS viewers, COUNT(*)::bigint AS samples
  FROM base GROUP BY 1, 2;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offer_traffic_daily(p_offer_id uuid, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(date date, spend_brl numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  o AS (SELECT apelido_interno FROM public.offers WHERE id = p_offer_id)
  SELECT t.date, COALESCE(SUM(t.spend), 0)::numeric AS spend_brl
  FROM public.traffic_data t, o
  WHERE t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
    AND t.date >= (SELECT d FROM today_brt) - INTERVAL '29 days'
    AND t.date <= (SELECT d FROM today_brt)
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
  GROUP BY t.date ORDER BY t.date;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offer_vsl_metrics(p_apelido text, p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(vsl_count_total bigint, vsl_count_period bigint, total_views bigint, unique_views bigint, button_clicks bigint, checkout_clicks bigint, revenue numeric, avg_retention numeric, conversion_rate numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH matched AS (
    SELECT * FROM public.vsl_data
    WHERE video_name ~* ('\m' || p_apelido || '\M')
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
  ),
  in_period AS (SELECT * FROM matched WHERE date >= p_start_date AND date <= p_end_date)
  SELECT
    (SELECT COUNT(DISTINCT video_id) FROM matched)::bigint,
    (SELECT COUNT(DISTINCT video_id) FROM in_period)::bigint,
    COALESCE(SUM(total_views), 0)::bigint,
    COALESCE(SUM(unique_views), 0)::bigint,
    COALESCE(SUM(button_clicks), 0)::bigint,
    COALESCE(SUM(checkout_clicks), 0)::bigint,
    COALESCE(SUM(revenue), 0)::numeric,
    CASE WHEN SUM(total_views) > 0 THEN (SUM(retention_rate * total_views) / SUM(total_views))::numeric ELSE NULL END,
    CASE WHEN SUM(button_clicks) > 0 THEN (SUM(checkout_clicks)::numeric / SUM(button_clicks)) * 100 ELSE NULL END
  FROM in_period;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_kpi_metrics(p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, spend_brl numeric, impressions bigint, link_clicks bigint, ic_count bigint, sales_count bigint, pitch_retention_pct numeric, cpc_brl numeric, cpm_brl numeric, ctr_pct numeric, cpi_brl numeric, conversion_pct numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH today_brt AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  offer_traffic AS (
    SELECT o.id AS offer_id, o.apelido_interno,
      COALESCE(SUM(t.spend), 0)::numeric AS spend_brl,
      COALESCE(SUM(t.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS link_clicks
    FROM public.offers o
    LEFT JOIN public.traffic_data t
      ON t.campaign_name ILIKE '%[' || o.apelido_interno || ']%'
     AND t.date >= (SELECT d FROM today_brt) - 6
     AND t.date <= (SELECT d FROM today_brt)
     AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno
  ),
  offer_ic AS (
    SELECT o.id AS offer_id,
      COUNT(*) FILTER (WHERE r.event_type = 'initiate_checkout')::bigint AS ic_count,
      COUNT(*) FILTER (WHERE r.event_type = 'purchase')::bigint AS sales_count
    FROM public.offers o
    LEFT JOIN public.redtrack_events r
      ON r.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
     AND r.occurred_at >= ((SELECT d FROM today_brt) - 6)::timestamp AT TIME ZONE 'America/Sao_Paulo'
     AND r.occurred_at <  ((SELECT d FROM today_brt) + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
     AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY o.id
  ),
  offer_pitch AS (
    SELECT o.id AS offer_id,
      CASE WHEN SUM(v.plays) > 0
        THEN (SUM(v.pitch_pct * v.plays) / NULLIF(SUM(v.plays), 0))::numeric
        ELSE NULL END AS pitch_retention_pct
    FROM public.offers o
    LEFT JOIN public.vturb_performance_daily v
      ON v.utm_campaign ILIKE '%[' || o.apelido_interno || ']%'
     AND v.date >= (SELECT d FROM today_brt) - 6
     AND v.date <= (SELECT d FROM today_brt)
     AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY o.id
  )
  SELECT ot.offer_id, ot.apelido_interno, ot.spend_brl, ot.impressions, ot.link_clicks,
    COALESCE(oi.ic_count, 0), COALESCE(oi.sales_count, 0), op.pitch_retention_pct,
    CASE WHEN ot.link_clicks > 0 THEN ot.spend_brl / ot.link_clicks ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.spend_brl / ot.impressions) * 1000 ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.link_clicks::numeric / ot.impressions) * 100 ELSE NULL END,
    CASE WHEN COALESCE(oi.ic_count, 0) > 0 THEN ot.spend_brl / oi.ic_count ELSE NULL END,
    CASE WHEN ot.link_clicks > 0 THEN (COALESCE(oi.sales_count, 0)::numeric / ot.link_clicks) * 100 ELSE NULL END
  FROM offer_traffic ot
  LEFT JOIN offer_ic oi ON oi.offer_id = ot.offer_id
  LEFT JOIN offer_pitch op ON op.offer_id = ot.offer_id;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_kpi_metrics_range(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, spend_brl numeric, impressions bigint, link_clicks bigint, ic_count bigint, sales_count bigint, pitch_retention_pct numeric, cpc_brl numeric, cpm_brl numeric, ctr_pct numeric, cpi_brl numeric, conversion_pct numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH offer_traffic AS (
    SELECT o.id AS offer_id, o.apelido_interno,
      COALESCE(SUM(t.spend), 0)::numeric AS spend_brl,
      COALESCE(SUM(t.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS link_clicks
    FROM public.offers o
    LEFT JOIN public.traffic_data t
      ON t.campaign_name ~* ('\[' || o.apelido_interno || '(_[^\]]+)?\]')
     AND t.date >= p_start_date AND t.date <= p_end_date
     AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno
  ),
  offer_ic AS (
    SELECT o.id AS offer_id,
      COUNT(*) FILTER (WHERE r.event_type = 'initiate_checkout')::bigint AS ic_count,
      COUNT(*) FILTER (WHERE r.event_type = 'purchase')::bigint AS sales_count
    FROM public.offers o
    LEFT JOIN public.redtrack_events r
      ON r.utm_campaign ~* ('\[' || o.apelido_interno || '(_[^\]]+)?\]')
     AND r.occurred_at >= (p_start_date)::timestamp AT TIME ZONE 'America/Sao_Paulo'
     AND r.occurred_at <  (p_end_date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
     AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY o.id
  ),
  offer_pitch AS (
    SELECT o.id AS offer_id,
      CASE WHEN SUM(v.total_views) > 0
        THEN (SUM(v.retention_rate * v.total_views) / NULLIF(SUM(v.total_views), 0))::numeric
        ELSE NULL END AS pitch_retention_pct
    FROM public.offers o
    LEFT JOIN public.vsl_data v
      ON v.video_name ~* ('\m' || o.apelido_interno || '\M')
     AND v.date >= p_start_date AND v.date <= p_end_date
     AND (p_operation_id IS NULL OR v.operation_id = p_operation_id)
    GROUP BY o.id
  )
  SELECT ot.offer_id, ot.apelido_interno, ot.spend_brl, ot.impressions, ot.link_clicks,
    COALESCE(oi.ic_count, 0), COALESCE(oi.sales_count, 0), op.pitch_retention_pct,
    CASE WHEN ot.link_clicks > 0 THEN ot.spend_brl / ot.link_clicks ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.spend_brl / ot.impressions) * 1000 ELSE NULL END,
    CASE WHEN ot.impressions > 0 THEN (ot.link_clicks::numeric / ot.impressions) * 100 ELSE NULL END,
    CASE WHEN COALESCE(oi.ic_count, 0) > 0 THEN ot.spend_brl / oi.ic_count ELSE NULL END,
    CASE WHEN ot.link_clicks > 0 THEN (COALESCE(oi.sales_count, 0)::numeric / ot.link_clicks) * 100 ELSE NULL END
  FROM offer_traffic ot
  LEFT JOIN offer_ic oi ON oi.offer_id = ot.offer_id
  LEFT JOIN offer_pitch op ON op.offer_id = ot.offer_id;
END;
$FN$;

CREATE OR REPLACE FUNCTION public.get_offers_revenue_range(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(offer_id uuid, apelido_interno text, revenue_brl numeric, sales integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path TO public
AS $FN$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
WITH fx AS (SELECT COALESCE((SELECT rate FROM exchange_rate_log ORDER BY created_at DESC LIMIT 1), 5.5)::numeric AS rate),
  offer_tags AS (
    SELECT o.id, o.apelido_interno, o.vendors_clickbank, tag
    FROM public.offers o
    CROSS JOIN LATERAL (SELECT unnest(ARRAY[o.apelido_interno] || COALESCE(o.aliases, ARRAY[]::text[])) AS tag) t
    WHERE o.status::text IS DISTINCT FROM 'morta'
      AND tag IS NOT NULL AND length(tag) >= 2
  ),
  cp_daily AS (
    SELECT ot.id AS offer_id, ot.apelido_interno, s.date AS d,
      COUNT(*) AS sales, COALESCE(SUM(s.revenue), 0)::numeric AS revenue_brl
    FROM offer_tags ot
    JOIN public.sales_data s ON s.utm_campaign ILIKE '%[' || ot.tag || ']%'
    WHERE s.date BETWEEN p_start_date AND p_end_date
      AND s.status = 'approved'
      AND (p_operation_id IS NULL OR s.operation_id = p_operation_id)
    GROUP BY ot.id, ot.apelido_interno, s.date
  ),
  rt_daily AS (
    SELECT ot.id AS offer_id, ot.apelido_interno,
      (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
      COUNT(*) AS sales,
      COALESCE(SUM(r.amount * (SELECT rate FROM fx)), 0)::numeric AS revenue_brl
    FROM offer_tags ot
    JOIN public.redtrack_events r ON r.utm_campaign ILIKE '%[' || ot.tag || ']%'
    WHERE r.event_type = 'purchase'
      AND (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR r.operation_id = p_operation_id)
    GROUP BY ot.id, ot.apelido_interno, (r.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  cb_vendor_daily AS (
    SELECT o.id AS offer_id, o.apelido_interno, cb.date AS d,
      COUNT(*) AS sales, COALESCE(SUM(cb.amount_brl), 0)::numeric AS revenue_brl
    FROM public.offers o
    JOIN public.clickbank_audit cb 
      ON LOWER(cb.vendor) = ANY(SELECT LOWER(unnest(o.vendors_clickbank)))
    WHERE cb.date BETWEEN p_start_date AND p_end_date
      AND cb.transaction_type = 'SALE'
      AND cb.amount_usd BETWEEN 180 AND 260
      AND COALESCE(array_length(o.vendors_clickbank, 1), 0) > 0
      AND o.status::text IS DISTINCT FROM 'morta'
      AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)
    GROUP BY o.id, o.apelido_interno, cb.date
  ),
  max_daily AS (
    SELECT offer_id, apelido_interno, d,
      GREATEST(COALESCE(MAX(cp_sales),0), COALESCE(MAX(rt_sales),0), COALESCE(MAX(cb_sales),0))::int AS sales,
      GREATEST(COALESCE(MAX(cp_rev),0), COALESCE(MAX(rt_rev),0), COALESCE(MAX(cb_rev),0))::numeric AS revenue_brl
    FROM (
      SELECT offer_id, apelido_interno, d, sales AS cp_sales, revenue_brl AS cp_rev,
             NULL::bigint AS rt_sales, NULL::numeric AS rt_rev,
             NULL::bigint AS cb_sales, NULL::numeric AS cb_rev FROM cp_daily
      UNION ALL
      SELECT offer_id, apelido_interno, d, NULL, NULL, sales, revenue_brl, NULL, NULL FROM rt_daily
      UNION ALL
      SELECT offer_id, apelido_interno, d, NULL, NULL, NULL, NULL, sales, revenue_brl FROM cb_vendor_daily
    ) u
    GROUP BY offer_id, apelido_interno, d
  )
  SELECT offer_id, apelido_interno,
    COALESCE(SUM(revenue_brl), 0)::numeric,
    COALESCE(SUM(sales), 0)::int
  FROM max_daily GROUP BY offer_id, apelido_interno;
END;
$FN$;