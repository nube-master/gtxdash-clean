-- Update RPC to include Hotmart cross-attribution by country using utm_campaign/meta_campaign_id
-- and expose impressions/clicks for UI display.

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
        -- Aggregate Meta insights by country and campaign
        -- We need campaign_id to link with Hotmart sales if country is missing in sales
        SELECT
            mci.country_code,
            mci.campaign_id,
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
            mci.country_code, mci.campaign_id
    ),
    meta_country_totals AS (
        SELECT
            ms.country_code,
            SUM(ms.spend) as spend,
            SUM(ms.impressions) as impressions,
            SUM(ms.clicks) as clicks,
            SUM(ms.link_clicks) as link_clicks,
            SUM(ms.lp_views) as lp_views,
            SUM(ms.initiate_checkouts) as ics,
            SUM(ms.purchases) as purchases,
            SUM(ms.revenue) as revenue
        FROM
            meta_stats ms
        GROUP BY
            ms.country_code
    ),
    campaign_country_weight AS (
        -- Calculate what % of a campaign's spend went to each country
        SELECT
            ms.campaign_id,
            ms.country_code,
            ms.spend / NULLIF(SUM(ms.spend) OVER(PARTITION BY ms.campaign_id), 0) as weight
        FROM
            meta_stats ms
    ),
    hotmart_sales AS (
        -- Get Hotmart sales and attribute them to countries based on campaign spend distribution
        SELECT
            ccw.country_code as country,
            SUM(ca.amount_brl * COALESCE(ccw.weight, 0)) as revenue
        FROM
            public.clickbank_audit ca
        LEFT JOIN
            campaign_country_weight ccw ON (ca.meta_campaign_id = ccw.campaign_id OR ca.utm_campaign = ccw.campaign_id)
        WHERE
            ca.operation_id = p_operation_id
            AND ca.vendor = 'hotmart'
            AND ca.transaction_type = 'SALE'
            AND ca.date >= p_start_date
            AND ca.date <= p_end_date
        GROUP BY
            1
    ),
    other_real_sales AS (
        -- Sales already containing country info (like CartPanda/ClickBank standard)
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
            AND s.store != 'hotmart' -- Avoid double counting if already attributed
        GROUP BY
            1
    ),
    combined_real_sales AS (
        SELECT 
            COALESCE(h.country, o.country) as country,
            (COALESCE(h.revenue, 0) + COALESCE(o.revenue, 0)) as revenue
        FROM 
            hotmart_sales h
        FULL OUTER JOIN 
            other_real_sales o ON h.country = o.country
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
        meta_country_totals m
    FULL OUTER JOIN
        combined_real_sales r ON m.country_code = r.country
    WHERE
        (COALESCE(m.spend, 0) >= p_min_spend OR COALESCE(r.revenue, 0) > 0)
    ORDER BY
        total_spend DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_country_performance(UUID, DATE, DATE, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_country_performance(UUID, DATE, DATE, NUMERIC) TO service_role;
