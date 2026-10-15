CREATE OR REPLACE FUNCTION public.get_cod_historical_approval_rate_v2(_operation_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate numeric;
BEGIN
    -- Calcula a taxa de entrega real (aprovados / total gerados)
    -- de pedidos criados entre 10 e 40 dias atrás (janela consolidada)
    SELECT 
        COALESCE(
            COUNT(*) FILTER (WHERE status = 'commission_approved')::numeric 
            / NULLIF(COUNT(*), 0),
            0.5238
        ) INTO v_rate
    FROM public.cod_orders
    WHERE operation_id = _operation_id
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN (CURRENT_DATE - INTERVAL '40 days') AND (CURRENT_DATE - INTERVAL '10 days');

    RETURN ROUND(v_rate, 4);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_historical_approval_rate_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_historical_approval_rate_v2(uuid) TO service_role;
