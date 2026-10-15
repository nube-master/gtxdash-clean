-- RPC para buscar métricas agregadas leves (Spend já é via get_spend_normalized_sp)
CREATE OR REPLACE FUNCTION public.get_total_traffic_metrics(
  p_start_date DATE,
  p_end_date DATE,
  p_operation_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_link_clicks BIGINT,
  total_landing_page_views BIGINT,
  total_impressions BIGINT,
  total_clicks BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(inline_link_clicks), 0)::BIGINT as total_link_clicks,
    COALESCE(SUM(landing_page_views), 0)::BIGINT as total_landing_page_views,
    COALESCE(SUM(impressions), 0)::BIGINT as total_impressions,
    COALESCE(SUM(clicks), 0)::BIGINT as total_clicks
  FROM public.traffic_data
  WHERE date >= p_start_date 
    AND date <= p_end_date
    AND (p_operation_id IS NULL OR operation_id = p_operation_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_traffic_metrics TO service_role;
