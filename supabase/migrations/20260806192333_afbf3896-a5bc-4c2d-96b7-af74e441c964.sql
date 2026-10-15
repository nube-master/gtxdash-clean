CREATE OR REPLACE FUNCTION public.get_total_traffic_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_operation_id UUID DEFAULT NULL,
  p_campaign_keyword TEXT DEFAULT NULL,
  p_strict_keyword BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  total_link_clicks BIGINT,
  total_landing_page_views BIGINT,
  total_vsl_plays BIGINT,
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_spend NUMERIC,
  total_revenue NUMERIC,
  total_purchase BIGINT,
  total_ic BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
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
      COALESCE(SUM(purchase_count), 0)::BIGINT as t_purchase,
      COALESCE(SUM(initiate_checkout), 0)::BIGINT as t_ic
    FROM public.traffic_data
    WHERE date >= p_start_date 
      AND date <= p_end_date
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
      AND (
        NOT p_strict_keyword 
        OR p_campaign_keyword IS NULL 
        OR p_campaign_keyword = '' 
        OR campaign_name ILIKE '%' || p_campaign_keyword || '%'
      )
  ),
  sales_agg AS (
    SELECT 
      COALESCE(SUM(revenue), 0)::NUMERIC as s_revenue
    FROM public.sales_data
    WHERE status = 'approved'
      AND (p_operation_id IS NULL OR operation_id = p_operation_id)
      -- Filtro de data exato para o dia (BRT)
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
    t.t_purchase,
    t.t_ic
  FROM traffic_agg t, sales_agg s;
END;
$$;