CREATE OR REPLACE FUNCTION public.get_total_traffic_metrics(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid, p_campaign_keyword text DEFAULT NULL::text, p_strict_keyword boolean DEFAULT false)
 RETURNS TABLE(total_link_clicks bigint, total_landing_page_views bigint, total_vsl_plays bigint, total_impressions bigint, total_clicks bigint, total_spend numeric, total_revenue numeric, total_purchase bigint, total_ic bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_usd_to_brl numeric;
    v_eur_to_brl numeric;
    v_today date;
BEGIN
    -- Authoritative BRL date
    v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

    -- Get USD rate
    SELECT COALESCE(
        (SELECT rate
         FROM public.exchange_rates_cache
         WHERE base_currency = 'USD' AND target_currency = 'BRL'
         ORDER BY fetched_at DESC
         LIMIT 1),
        5.1859
    ) INTO v_usd_to_brl;

    -- Get EUR rate
    SELECT COALESCE(
        (SELECT rate
         FROM public.exchange_rates_cache
         WHERE base_currency = 'EUR' AND target_currency = 'BRL'
         ORDER BY fetched_at DESC
         LIMIT 1),
        v_usd_to_brl * 1.17
    ) INTO v_eur_to_brl;

    RETURN QUERY
    WITH meta_traffic AS (
        SELECT
            COALESCE(SUM(t.inline_link_clicks), 0)::BIGINT as t_link_clicks,
            COALESCE(SUM(t.landing_page_views), 0)::BIGINT as t_lp_views,
            COALESCE(SUM(t.thruplays), 0)::BIGINT as t_vsl_plays,
            COALESCE(SUM(t.impressions), 0)::BIGINT as t_impressions,
            COALESCE(SUM(t.clicks), 0)::BIGINT as t_clicks,
            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(acc.currency, 'USD') = 'USD' THEN t.spend * v_usd_to_brl
                    WHEN acc.currency = 'EUR' THEN t.spend * v_eur_to_brl
                    WHEN acc.currency = 'BRL' THEN t.spend
                    ELSE t.spend * v_usd_to_brl
                END
            ), 0)::NUMERIC as t_spend,
            COALESCE(SUM(COALESCE(t.initiate_checkout, 0) + COALESCE(t.fb_pixel_initiate_checkout, 0)), 0)::BIGINT as t_ic
        FROM public.traffic_data t
        LEFT JOIN public.meta_ad_accounts acc ON t.account_id = acc.account_id
        WHERE t.date >= p_start_date
          AND t.date <= p_end_date
          AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
          AND (
            NOT p_strict_keyword
            OR p_campaign_keyword IS NULL
            OR p_campaign_keyword = ''
            OR (t.campaign_name ILIKE '%' || p_campaign_keyword || '%')
          )
    ),
    newsbreak_traffic AS (
        SELECT
            COALESCE(SUM(clicks), 0)::BIGINT as nb_clicks,
            COALESCE(SUM(impressions), 0)::BIGINT as nb_impressions,
            COALESCE(SUM(spend * v_usd_to_brl), 0)::NUMERIC as nb_spend
        FROM public.newsbreak_traffic_data
        WHERE date >= p_start_date
          AND date <= p_end_date
          AND (p_operation_id IS NULL OR operation_id = p_operation_id)
    ),
    mgid_traffic AS (
        SELECT
            COALESCE(SUM(clicks), 0)::BIGINT as mg_clicks,
            COALESCE(SUM(impressions), 0)::BIGINT as mg_impressions,
            COALESCE(SUM(spend * v_usd_to_brl), 0)::NUMERIC as mg_spend
        FROM public.mgid_traffic_data
        WHERE date >= p_start_date
          AND date <= p_end_date
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
    ),
    hourly_fallback AS (
        SELECT
            COALESCE(SUM(
                CASE 
                    WHEN COALESCE(acc.currency, 'USD') = 'USD' THEN t.spend * v_usd_to_brl
                    WHEN acc.currency = 'EUR' THEN t.spend * v_eur_to_brl
                    WHEN acc.currency = 'BRL' THEN t.spend
                    ELSE t.spend * v_usd_to_brl
                END
            ), 0)::NUMERIC as h_spend,
            COALESCE(SUM(t.clicks), 0)::BIGINT as h_clicks,
            COALESCE(SUM(t.impressions), 0)::BIGINT as h_impressions,
            COALESCE(SUM(t.landing_page_views), 0)::BIGINT as h_lp_views,
            COALESCE(SUM(t.initiated_checkouts), 0)::BIGINT as h_ic,
            COALESCE(SUM(t.vsl_plays), 0)::BIGINT as h_vsl_plays
        FROM public.traffic_data_hourly t
        LEFT JOIN public.meta_ad_accounts acc ON t.account_id = acc.account_id
        WHERE t.date >= p_start_date
          AND t.date <= p_end_date
          AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
    )
    SELECT
        (m.t_link_clicks + nb.nb_clicks + mg.mg_clicks)::BIGINT,
        GREATEST(m.t_lp_views, h.h_lp_views)::BIGINT,
        GREATEST(m.t_vsl_plays, h.h_vsl_plays)::BIGINT,
        (GREATEST(m.t_impressions, h.h_impressions) + nb.nb_impressions + mg.mg_impressions)::BIGINT,
        (GREATEST(m.t_clicks, h.h_clicks) + nb.nb_clicks + mg.mg_clicks)::BIGINT,
        (GREATEST(m.t_spend, h.h_spend) + nb.nb_spend + mg.mg_spend)::NUMERIC,
        s.s_revenue,
        s.s_conversions,
        GREATEST(m.t_ic, h.h_ic)::BIGINT
    FROM meta_traffic m
    CROSS JOIN newsbreak_traffic nb
    CROSS JOIN mgid_traffic mg
    CROSS JOIN sales_agg s
    CROSS JOIN hourly_fallback h;
END;
$function$;