CREATE OR REPLACE FUNCTION public.get_total_link_clicks(
  p_start_date date,
  p_end_date date,
  p_operation_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(total_link_clicks bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(t.inline_link_clicks), 0)::bigint AS total_link_clicks
  FROM public.traffic_data t
  WHERE t.date >= p_start_date
    AND t.date <= p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id);
$$;