
CREATE OR REPLACE FUNCTION public.get_cod_historical_approval_rate_v2(_operation_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ROUND(
      COUNT(*) FILTER (WHERE status = 'commission_approved')::numeric 
      / NULLIF(COUNT(*), 0) 
      * 100, 2
    ),
    52.38
  )
  FROM public.cod_orders
  WHERE operation_id = _operation_id
    AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date 
        BETWEEN CURRENT_DATE - INTERVAL '30 days' 
            AND CURRENT_DATE - INTERVAL '10 days';
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_historical_approval_rate_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_historical_approval_rate_v2(uuid) TO service_role;
