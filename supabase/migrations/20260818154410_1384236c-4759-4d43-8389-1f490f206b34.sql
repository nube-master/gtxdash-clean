CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v11(
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
    orders_cancelled bigint,
    orders_paid bigint,
    orders_pending bigint,
    revenue_generated numeric,
    revenue_approved numeric,
    revenue_total numeric,
    commission_generated numeric,
    pending_commission_total numeric,
    ticket_avg_approved numeric,
    commission_avg_approved numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_date_from, p_date_to, interval '1 day')::date as d
    ),
    daily_stats AS (
        SELECT 
            (created_at AT TIME ZONE 'America/Sao_Paulo')::date as o_date,
            COUNT(*) as gen,
            COUNT(*) FILTER (WHERE status = 'commission_approved') as app,
            -- REGRA: Expired só conta se tiver > 10 dias da criação. Se < 10 dias e expired, é cancelado.
            COUNT(*) FILTER (WHERE status = 'expired' AND (NOW() - created_at) >= interval '10 days') as exp,
            COUNT(*) FILTER (WHERE status = 'expired' AND (NOW() - created_at) < interval '10 days') as canc,
            COUNT(*) FILTER (WHERE status = 'paid') as paid,
            COUNT(*) FILTER (WHERE status = 'pending') as pend,
            
            -- FIX SEMÂNTICA: Dashboard COD FAHTO nunca mostra GMV/order_total. Só comissão afiliado.
            -- FAT.GERADO = SUM(commission_value_brl) (Todos os pedidos)
            COALESCE(SUM(commission_value_brl), 0) as rev_gen,
            
            -- FAT.ENTREGUE = SUM(commission_value_brl) (Apenas status commission_approved)
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'commission_approved'), 0) as rev_app,
            
            -- Mantendo rev_tot como comissão aprovada para compatibilidade com hooks
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'commission_approved'), 0) as rev_tot,
            
            COALESCE(SUM(commission_value_brl), 0) as comm_gen,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'pending'), 0) as pend_comm_tot
        FROM public.cod_orders
        WHERE operation_id = p_operation_id
          AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_date_from AND p_date_to
        GROUP BY 1
    )
    SELECT 
        ds.d as res_date,
        COALESCE(s.gen, 0)::bigint,
        COALESCE(s.app, 0)::bigint,
        COALESCE(s.exp, 0)::bigint,
        COALESCE(s.canc, 0)::bigint,
        COALESCE(s.paid, 0)::bigint,
        COALESCE(s.pend, 0)::bigint,
        COALESCE(s.rev_gen, 0)::numeric,
        COALESCE(s.rev_app, 0)::numeric,
        COALESCE(s.rev_tot, 0)::numeric,
        COALESCE(s.comm_gen, 0)::numeric,
        COALESCE(s.pend_comm_tot, 0)::numeric,
        -- Ticket Médio (agora baseado em comissão)
        CASE WHEN COALESCE(s.app, 0) > 0 THEN s.rev_app / s.app ELSE 0 END::numeric as ticket_avg_approved,
        CASE WHEN COALESCE(s.app, 0) > 0 THEN s.rev_tot / s.app ELSE 0 END::numeric as commission_avg_approved
    FROM date_series ds
    LEFT JOIN daily_stats s ON ds.d = s.o_date
    ORDER BY ds.d DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v11 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v11 TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v11 TO anon;
