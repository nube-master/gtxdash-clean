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
BEGIN
    RETURN QUERY
    WITH traffic_agg AS (
        SELECT
            COALESCE(SUM(inline_link_clicks), 0)::BIGINT as t_link_clicks,
            COALESCE(SUM(landing_page_views), 0)::BIGINT as t_lp_views,
            COALESCE(SUM(thruplays), 0)::BIGINT as t_vsl_plays,
            COALESCE(SUM(impressions), 0)::BIGINT as t_impressions,
            COALESCE(SUM(clicks), 0)::BIGINT as t_clicks,
            COALESCE(SUM(spend), 0)::NUMERIC as t_spend,
            COALESCE(SUM(initiate_checkout + fb_pixel_initiate_checkout), 0)::BIGINT as t_ic
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
    sales_agg AS (
        SELECT
            COALESCE(SUM(revenue), 0)::NUMERIC as s_revenue,
            COUNT(*)::BIGINT as s_conversions
        FROM public.sales_data
        WHERE status = 'approved'
          AND (p_operation_id IS NULL OR operation_id = p_operation_id)
          AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= p_start_date
          AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date <= p_end_date
    )
    SELECT
        t.t_link_clicks,
        t.t_lp_views,
        t.t_vsl_plays,
        t.t_impressions,
        t.t_clicks,
        t.t_spend,
        s.s_revenue,
        s.s_conversions,
        t.t_ic
    FROM traffic_agg t, sales_agg s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics(date, date, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics(date, date, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics(date, date, uuid, text, boolean) TO anon;