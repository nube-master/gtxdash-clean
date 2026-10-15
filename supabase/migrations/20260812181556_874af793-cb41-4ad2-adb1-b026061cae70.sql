
DROP FUNCTION IF EXISTS public.get_country_performance(UUID, DATE, DATE, NUMERIC);

CREATE OR REPLACE FUNCTION public.get_country_performance(
    p_operation_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_min_spend NUMERIC DEFAULT 0
)
RETURNS TABLE (
    country_code TEXT,
    total_spend NUMERIC,
    total_impressions BIGINT,
    total_clicks BIGINT,
    total_link_clicks BIGINT,
    total_lp_views BIGINT,
    total_ics BIGINT,
    total_purchases BIGINT,
    total_revenue NUMERIC,
    real_revenue NUMERIC,
    roas NUMERIC,
    real_roas NUMERIC,
    cpc NUMERIC,
    cpa NUMERIC,
    connect_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH meta_stats AS (
        SELECT
            mci.country_code,
            SUM(mci.spend) as spend,
            SUM(mci.impressions) as impressions,
            SUM(mci.clicks) as clicks,
            SUM(mci.link_clicks) as link_clicks,
            SUM(mci.lp_views) as lp_views,
            SUM(mci.initiate_checkouts) as ics,
            SUM(mci.purchases) as purchases,
            SUM(mci.revenue) as revenue
        FROM
            public.meta_country_insights mci
        WHERE
            mci.operation_id = p_operation_id
            AND mci.date >= p_start_date
            AND mci.date <= p_end_date
        GROUP BY
            mci.country_code
    ),
    real_sales AS (
        SELECT
            UPPER(COALESCE(s.country, 'UNKNOWN')) as country,
            SUM(s.revenue) as revenue
        FROM
            public.sales_data s
        WHERE
            s.operation_id = p_operation_id
            AND s.date >= p_start_date
            AND s.date <= p_end_date
            AND s.status = 'approved'
        GROUP BY
            1
    )
    SELECT
        COALESCE(m.country_code, r.country) as country_code,
        COALESCE(m.spend, 0)::numeric as total_spend,
        COALESCE(m.impressions, 0)::bigint as total_impressions,
        COALESCE(m.clicks, 0)::bigint as total_clicks,
        COALESCE(m.link_clicks, 0)::bigint as total_link_clicks,
        COALESCE(m.lp_views, 0)::bigint as total_lp_views,
        COALESCE(m.ics, 0)::bigint as total_ics,
        COALESCE(m.purchases, 0)::bigint as total_purchases,
        COALESCE(m.revenue, 0)::numeric as total_revenue,
        COALESCE(r.revenue, 0)::numeric as real_revenue,
        CASE WHEN COALESCE(m.spend, 0) > 0 THEN COALESCE(m.revenue, 0) / m.spend ELSE 0 END::numeric as roas,
        CASE WHEN COALESCE(m.spend, 0) > 0 THEN COALESCE(r.revenue, 0) / m.spend ELSE 0 END::numeric as real_roas,
        CASE WHEN COALESCE(m.link_clicks, 0) > 0 THEN COALESCE(m.spend, 0) / m.link_clicks ELSE 0 END::numeric as cpc,
        CASE WHEN COALESCE(m.purchases, 0) > 0 THEN COALESCE(m.spend, 0) / m.purchases ELSE 0 END::numeric as cpa,
        CASE WHEN COALESCE(m.link_clicks, 0) > 0 THEN (COALESCE(m.lp_views, 0)::numeric / NULLIF(m.link_clicks, 0)) * 100 ELSE 0 END::numeric as connect_rate
    FROM
        meta_stats m
    FULL OUTER JOIN
        real_sales r ON m.country_code = r.country
    WHERE
        COALESCE(m.spend, 0) >= p_min_spend
    ORDER BY
        total_spend DESC;
END;
$$;
