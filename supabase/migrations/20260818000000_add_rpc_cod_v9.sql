CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v9(
    p_operation_id uuid,
    p_date_from date,
    p_date_to date,
    p_display_currency text DEFAULT 'BRL'
)
RETURNS TABLE (
    res_date date,
    orders_generated bigint,
    orders_approved bigint,
    orders_expired bigint,
    orders_paid bigint,
    orders_pending bigint,
    orders_cancelled bigint,
    revenue_generated numeric,
    revenue_approved numeric,
    revenue_total numeric,
    commission_generated numeric,
    ticket_avg_approved numeric,
    commission_avg_approved numeric,
    pending_commission_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (o.created_at AT TIME ZONE 'Europe/Warsaw')::date AS res_date,
        COUNT(*) AS orders_generated,
        COUNT(*) FILTER (WHERE o.status = 'commission_approved') AS orders_approved,
        -- REGRA NOVA: Expired só após 10 dias da criação
        COUNT(*) FILTER (WHERE o.status = 'expired' AND (NOW() - o.created_at) >= INTERVAL '10 days') AS orders_expired,
        COUNT(*) FILTER (WHERE o.status = 'paid') AS orders_paid,
        COUNT(*) FILTER (WHERE o.status = 'pending') AS orders_pending,
        -- REGRA NOVA: Cancelados (Expired precoce ou outros status de rejeição)
        COUNT(*) FILTER (WHERE o.status IN ('cancelled', 'rejected', 'refused') OR (o.status = 'expired' AND (NOW() - o.created_at) < INTERVAL '10 days')) AS orders_cancelled,
        
        -- GMV (Order Value)
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(SUM(o.order_value), 0)
            ELSE COALESCE(SUM(o.order_value_brl), 0)
        END AS revenue_generated,
        
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(SUM(o.order_value) FILTER (WHERE o.status = 'commission_approved'), 0)
            ELSE COALESCE(SUM(o.order_value_brl) FILTER (WHERE o.status = 'commission_approved'), 0)
        END AS revenue_approved,

        -- Comissão Aprovada (Receita Real)
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(SUM(o.commission_value) FILTER (WHERE o.status = 'commission_approved'), 0)
            ELSE COALESCE(SUM(o.commission_value_brl) FILTER (WHERE o.status = 'commission_approved'), 0)
        END AS revenue_total,
        
        -- Comissão Gerada Total (Potencial)
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(SUM(o.commission_value), 0)
            ELSE COALESCE(SUM(o.commission_value_brl), 0)
        END AS commission_generated,
        
        -- Médias
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(AVG(o.order_value) FILTER (WHERE o.status = 'commission_approved'), 0)
            ELSE COALESCE(AVG(o.order_value_brl) FILTER (WHERE o.status = 'commission_approved'), 0)
        END AS ticket_avg_approved,
        
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(AVG(o.commission_value) FILTER (WHERE o.status = 'commission_approved'), 0)
            ELSE COALESCE(AVG(o.commission_value_brl) FILTER (WHERE o.status = 'commission_approved'), 0)
        END AS commission_avg_approved,

        -- Comissão Pendente (para projeções precisas)
        CASE 
            WHEN p_display_currency = 'USD' THEN COALESCE(SUM(o.commission_value) FILTER (WHERE o.status = 'pending'), 0)
            ELSE COALESCE(SUM(o.commission_value_brl) FILTER (WHERE o.status = 'pending'), 0)
        END AS pending_commission_total
        
    FROM cod_orders o
    WHERE o.operation_id = p_operation_id
      AND (o.created_at AT TIME ZONE 'Europe/Warsaw')::date BETWEEN p_date_from AND p_date_to
    GROUP BY 1
    ORDER BY 1 DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v9(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v9(uuid, date, date, text) TO service_role;
