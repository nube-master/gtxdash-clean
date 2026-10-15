CREATE OR REPLACE FUNCTION public.get_meta_spend_brl_daily(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(t.spend_brl), 0)::numeric
  FROM public.traffic_data t
  WHERE t.date BETWEEN p_start_date AND p_end_date
    AND (p_operation_id IS NULL OR t.operation_id = p_operation_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_meta_spend_brl_daily(date, date, uuid) TO authenticated, service_role;