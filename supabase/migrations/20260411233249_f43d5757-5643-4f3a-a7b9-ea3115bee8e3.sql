CREATE OR REPLACE FUNCTION public.get_traffic_clicks_total(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(total_clicks bigint, total_impressions bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(t.clicks), 0)::bigint AS total_clicks,
    COALESCE(SUM(t.impressions), 0)::bigint AS total_impressions
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id);
$$;