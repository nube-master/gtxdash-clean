CREATE OR REPLACE FUNCTION public.get_total_traffic_metrics(
    p_start_date date,
    p_end_date date,
    p_operation_id uuid DEFAULT NULL::uuid,
    p_campaign_keyword text DEFAULT NULL::text,
    p_strict_keyword boolean DEFAULT false
)
RETURNS TABLE(
    total_link_clicks bigint,
    total_landing_page_views bigint,
    total_vsl_plays bigint,
    total_impressions bigint,
    total_clicks bigint,
    total_spend numeric,
    total_revenue numeric,
    total_purchase bigint,
    total_ic bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usd_to_brl numeric;
BEGIN
    -- Obter a última taxa de câmbio disponível (fallback 5.15)
    SELECT COALESCE((SELECT rate FROM public.exchange_rates_cache WHERE pair = 'USD/BRL' ORDER BY updated_at DESC LIMIT 1), 5.15) INTO v_usd_to_brl;

    RETURN QUERY
    WITH meta_traffic AS (
        SELECT
            COALESCE(SUM(inline_link_clicks), 0)::BIGINT as t_link_clicks,
            COALESCE(SUM(landing_page_views), 0)::BIGINT as t_lp_views,
            COALESCE(SUM(thruplays), 0)::BIGINT as t_vsl_plays,
            COALESCE(SUM(impressions), 0)::BIGINT as t_impressions,
            COALESCE(SUM(clicks), 0)::BIGINT as t_clicks,
            COALESCE(SUM(spend), 0)::NUMERIC as t_spend,
            COALESCE(SUM(COALESCE(initiate_checkout, 0) + COALESCE(fb_pixel_initiate_checkout, 0)), 0)::BIGINT as t_ic
        FROM public.traffic_data
        WHERE date >= p_start_date
          AND date <= p_end_date
          AND (p_operation_id IS NULL OR operation_id = p_operation_id)
          AND (
            NOT p_strict_keyword
            OR p_campaign_keyword IS NULL
            OR p_campaign_keyword = ''
            OR (campaign_name ILIKE '%' || p_campaign_keyword || '%')
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
    FROM meta_traffic m, newsbreak_traffic nb, mgid_traffic mg, sales_agg s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics TO service_role;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics TO anon;