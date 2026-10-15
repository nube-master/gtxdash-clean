CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v6(
    p_operation_id uuid,
    p_date_from date,
    p_date_to date
)
RETURNS TABLE (
    res_date text,
    orders_generated bigint,
    orders_approved bigint,
    orders_paid bigint,
    orders_expired bigint,
    revenue_generated numeric,
    revenue_approved numeric,
    revenue_total numeric,
    commission_generated numeric,
    commission_approved numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH daily_stats AS (
        SELECT 
            order_date::text as d,
            -- Pedidos Gerados (apenas pendentes conforme regra de call center)
            COUNT(*) FILTER (WHERE status = 'pending') as gen,
            
            -- Pedidos Aprovados (status final ou comercial)
            COUNT(*) FILTER (WHERE status IN ('commission_approved', 'delivered', 'paid')) as app,
            
            -- Pedidos Pagos
            COUNT(*) FILTER (WHERE status = 'paid') as paid,
            
            -- Pedidos Expirados
            COUNT(*) FILTER (WHERE status = 'expired') as exp,
            
            -- Faturamento Bruto (GERADOS = pendentes)
            SUM(order_value_brl) FILTER (WHERE status = 'pending') as rev_gen,
            
            -- Faturamento Aprovado
            SUM(order_value_brl) FILTER (WHERE status IN ('commission_approved', 'delivered', 'paid')) as rev_app,
            
            -- Comissão Total (sempre usa valor BRL convertido)
            SUM(commission_value_brl) FILTER (WHERE status IN ('commission_approved', 'delivered', 'paid')) as com_total,
            
            -- Comissão Gerada (pendentes)
            SUM(commission_value_brl) FILTER (WHERE status = 'pending') as com_gen,
            
            -- Comissão Aprovada
            SUM(commission_value_brl) FILTER (WHERE status IN ('commission_approved', 'delivered', 'paid')) as com_app
            
        FROM public.cod_orders
        WHERE operation_id = p_operation_id
          AND order_date >= p_date_from
          AND order_date <= p_date_to
        GROUP BY 1
    )
    SELECT 
        d,
        gen,
        app,
        paid,
        exp,
        COALESCE(rev_gen, 0),
        COALESCE(rev_app, 0),
        COALESCE(com_total, 0),
        COALESCE(com_gen, 0),
        COALESCE(com_app, 0)
    FROM daily_stats
    ORDER BY d DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v6 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v6 TO service_role;