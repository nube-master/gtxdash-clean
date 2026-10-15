DROP FUNCTION IF EXISTS public.get_traffic_spend_by_account_normalized(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_traffic_spend_by_account_normalized(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(account_id text, date date, total_spend numeric, used_fallback boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_op_access(p_operation_id);
  RETURN QUERY
  WITH brt_timezones AS (SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz),
  daily AS (
    SELECT t.account_id AS acc_id, t.date AS business_date, SUM(t.spend_brl) AS spend,
           bool_or(a.timezone IS NULL OR a.timezone IN (SELECT tz FROM brt_timezones)) AS is_brt
    FROM traffic_data t
    JOIN meta_ad_accounts a ON a.account_id = t.account_id AND a.is_active = true
    WHERE t.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY t.account_id, t.date
  ),
  hourly AS (
    SELECT h.account_id AS acc_id, h.date AS business_date, SUM(h.spend_brl) AS spend
    FROM traffic_data_hourly h
    JOIN meta_ad_accounts a ON a.account_id = h.account_id AND a.is_active = true
    WHERE h.date BETWEEN p_start_date AND p_end_date
      AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
      AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
    GROUP BY h.account_id, h.date
  ),
  merged AS (
    SELECT
      COALESCE(h.acc_id, d.acc_id) AS acc_id,
      COALESCE(h.business_date, d.business_date) AS business_date,
      CASE
        WHEN COALESCE(d.is_brt, false) THEN COALESCE(d.spend, 0)
        WHEN h.spend IS NOT NULL THEN h.spend
        ELSE COALESCE(d.spend, 0)
      END AS spend,
      (NOT COALESCE(d.is_brt, false) AND h.spend IS NULL AND d.spend IS NOT NULL) AS fallback
    FROM daily d
    FULL OUTER JOIN hourly h
      ON h.acc_id = d.acc_id AND h.business_date = d.business_date
  )
  SELECT m.acc_id, m.business_date, COALESCE(SUM(m.spend), 0)::numeric, bool_or(m.fallback)
  FROM merged m
  WHERE m.business_date BETWEEN p_start_date AND p_end_date
  GROUP BY m.acc_id, m.business_date;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_traffic_spend_by_account_normalized(date, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_traffic_spend_by_account_normalized(date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_traffic_spend_by_account_normalized(date, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_total_traffic_metrics(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid,
  p_campaign_keyword text DEFAULT NULL::text,
  p_strict_keyword boolean DEFAULT false
)
RETURNS TABLE(total_link_clicks bigint, total_landing_page_views bigint, total_vsl_plays bigint, total_impressions bigint, total_clicks bigint, total_spend numeric, total_revenue numeric, total_purchase bigint, total_ic bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_usd_to_brl numeric;
BEGIN
    SELECT COALESCE(
        (SELECT rate FROM public.exchange_rates_cache
         WHERE base_currency = 'USD' AND target_currency = 'BRL'
         ORDER BY fetched_at DESC LIMIT 1),
        5.1859
    ) INTO v_usd_to_brl;

    RETURN QUERY
    WITH brt_timezones AS (SELECT unnest(ARRAY['America/Sao_Paulo', 'America/Bahia']) AS tz),
    daily AS (
        SELECT t.account_id AS acc_id, t.date AS business_date,
            COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS link_clicks,
            COALESCE(SUM(t.landing_page_views), 0)::bigint AS lp_views,
            COALESCE(SUM(t.thruplays), 0)::bigint AS vsl_plays,
            COALESCE(SUM(t.impressions), 0)::bigint AS impressions,
            COALESCE(SUM(t.clicks), 0)::bigint AS clicks,
            COALESCE(SUM(t.spend_brl), 0)::numeric AS spend,
            COALESCE(SUM(COALESCE(t.initiate_checkout,0) + COALESCE(t.fb_pixel_initiate_checkout,0)), 0)::bigint AS ic,
            bool_or(a.timezone IS NULL OR a.timezone IN (SELECT tz FROM brt_timezones)) AS is_brt
        FROM public.traffic_data t
        LEFT JOIN public.meta_ad_accounts a ON a.account_id = t.account_id
        WHERE t.date BETWEEN p_start_date AND p_end_date
          AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
          AND (
            NOT p_strict_keyword
            OR p_campaign_keyword IS NULL
            OR p_campaign_keyword = ''
            OR (t.campaign_name ILIKE '%' || p_campaign_keyword || '%')
          )
        GROUP BY t.account_id, t.date
    ),
    hourly AS (
        SELECT h.account_id AS acc_id, h.date AS business_date,
            COALESCE(SUM(h.landing_page_views), 0)::bigint AS lp_views,
            COALESCE(SUM(h.vsl_plays), 0)::bigint AS vsl_plays,
            COALESCE(SUM(h.impressions), 0)::bigint AS impressions,
            COALESCE(SUM(h.clicks), 0)::bigint AS clicks,
            COALESCE(SUM(h.spend_brl), 0)::numeric AS spend,
            COALESCE(SUM(h.initiated_checkouts), 0)::bigint AS ic
        FROM public.traffic_data_hourly h
        WHERE h.date BETWEEN p_start_date AND p_end_date
          AND (p_operation_id IS NULL OR h.operation_id = p_operation_id)
          AND (
            NOT p_strict_keyword
            OR p_campaign_keyword IS NULL
            OR p_campaign_keyword = ''
            OR (h.campaign_name ILIKE '%' || p_campaign_keyword || '%')
          )
        GROUP BY h.account_id, h.date
    ),
    merged AS (
        SELECT
            CASE WHEN COALESCE(d.is_brt, false) OR h.spend IS NULL THEN COALESCE(d.spend,0) ELSE h.spend END AS spend,
            CASE WHEN COALESCE(d.is_brt, false) OR h.impressions IS NULL THEN COALESCE(d.impressions,0) ELSE h.impressions END AS impressions,
            CASE WHEN COALESCE(d.is_brt, false) OR h.clicks IS NULL THEN COALESCE(d.clicks,0) ELSE h.clicks END AS clicks,
            CASE WHEN COALESCE(d.is_brt, false) OR h.lp_views IS NULL THEN COALESCE(d.lp_views,0) ELSE GREATEST(COALESCE(d.lp_views,0), h.lp_views) END AS lp_views,
            CASE WHEN COALESCE(d.is_brt, false) OR h.vsl_plays IS NULL THEN COALESCE(d.vsl_plays,0) ELSE GREATEST(COALESCE(d.vsl_plays,0), h.vsl_plays) END AS vsl_plays,
            CASE WHEN COALESCE(d.is_brt, false) OR h.ic IS NULL THEN COALESCE(d.ic,0) ELSE GREATEST(COALESCE(d.ic,0), h.ic) END AS ic,
            COALESCE(d.link_clicks, 0) AS link_clicks
        FROM daily d
        FULL OUTER JOIN hourly h
          ON h.acc_id = d.acc_id AND h.business_date = d.business_date
    ),
    meta_traffic AS (
        SELECT
            COALESCE(SUM(link_clicks),0)::bigint AS t_link_clicks,
            COALESCE(SUM(lp_views),0)::bigint AS t_lp_views,
            COALESCE(SUM(vsl_plays),0)::bigint AS t_vsl_plays,
            COALESCE(SUM(impressions),0)::bigint AS t_impressions,
            COALESCE(SUM(clicks),0)::bigint AS t_clicks,
            COALESCE(SUM(spend),0)::numeric AS t_spend,
            COALESCE(SUM(ic),0)::bigint AS t_ic
        FROM merged
    ),
    newsbreak_traffic AS (
        SELECT
            COALESCE(SUM(clicks), 0)::BIGINT as nb_clicks,
            COALESCE(SUM(impressions), 0)::BIGINT as nb_impressions,
            COALESCE(SUM(spend * v_usd_to_brl), 0)::NUMERIC as nb_spend
        FROM public.newsbreak_traffic_data
        WHERE date BETWEEN p_start_date AND p_end_date
          AND (p_operation_id IS NULL OR operation_id = p_operation_id)
    ),
    mgid_traffic AS (
        SELECT
            COALESCE(SUM(clicks), 0)::BIGINT as mg_clicks,
            COALESCE(SUM(impressions), 0)::BIGINT as mg_impressions,
            COALESCE(SUM(spend * v_usd_to_brl), 0)::NUMERIC as mg_spend
        FROM public.mgid_traffic_data
        WHERE date BETWEEN p_start_date AND p_end_date
          AND (p_operation_id IS NULL OR operation_id = p_operation_id)
    ),
    sales_agg AS (
        SELECT
            COALESCE(SUM(revenue), 0)::NUMERIC as s_revenue,
            COUNT(*)::BIGINT as s_conversions
        FROM public.sales_data
        WHERE status = 'approved'
          AND (p_operation_id IS NULL OR operation_id = p_operation_id)
          AND (
            CASE
              WHEN date IS NOT NULL THEN date >= p_start_date AND date <= p_end_date
              ELSE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
                   AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
            END
          )
    )
    SELECT
        (m.t_link_clicks + nb.nb_clicks + mg.mg_clicks)::BIGINT,
        m.t_lp_views,
        m.t_vsl_plays,
        (m.t_impressions + nb.nb_impressions + mg.mg_impressions)::BIGINT,
        (m.t_clicks + nb.nb_clicks + mg.mg_clicks)::BIGINT,
        (m.t_spend + nb.nb_spend + mg.mg_spend)::NUMERIC,
        s.s_revenue,
        s.s_conversions,
        m.t_ic
    FROM meta_traffic m
    CROSS JOIN newsbreak_traffic nb
    CROSS JOIN mgid_traffic mg
    CROSS JOIN sales_agg s;
END;
$function$;