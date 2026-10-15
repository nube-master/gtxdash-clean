CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v13(
    p_operation_id uuid, 
    p_date_from date, 
    p_date_to date, 
    p_display_currency text DEFAULT 'BRL'::text
)
RETURNS TABLE(
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
    commission_avg_approved numeric, 
    avg_comm_7d_brl numeric,
    invest_total_brl numeric
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_avg_comm_7d numeric;
    v_usd_rate numeric;
    v_eur_rate numeric;
BEGIN
    -- Obter taxas de câmbio
    SELECT usd_to_brl, eur_to_brl INTO v_usd_rate, v_eur_rate FROM public.exchange_rates_cache LIMIT 1;
    v_usd_rate := COALESCE(v_usd_rate, 5.20);
    v_eur_rate := COALESCE(v_eur_rate, 5.60);

    -- Cálculo dinâmico da comissão média dos últimos 7 dias (com base em atualizações BRT)
    SELECT COALESCE(AVG(commission_value_brl), 501.33) INTO v_avg_comm_7d
    FROM public.cod_orders
    WHERE operation_id = p_operation_id
      AND status = 'commission_approved'
      AND (updated_at AT TIME ZONE 'America/Sao_Paulo')::date >= (CURRENT_DATE - INTERVAL '7 days');

    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_date_from, p_date_to, interval '1 day')::date as d
    ),
    daily_stats AS (
        SELECT 
            (created_at AT TIME ZONE 'America/Sao_Paulo')::date as o_date,
            COUNT(*) as gen,
            COUNT(*) FILTER (WHERE status = 'commission_approved') as app,
            COUNT(*) FILTER (WHERE status = 'expired' AND (NOW() - created_at) >= interval '10 days') as exp,
            COUNT(*) FILTER (WHERE status = 'expired' AND (NOW() - created_at) < interval '10 days') as canc,
            COUNT(*) FILTER (WHERE status = 'paid') as paid,
            COUNT(*) FILTER (WHERE status = 'pending') as pend,
            
            COALESCE(SUM(commission_value_brl), 0) as rev_gen,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'commission_approved'), 0) as rev_app,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'commission_approved'), 0) as rev_tot,
            COALESCE(SUM(commission_value_brl), 0) as comm_gen,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'pending'), 0) as pend_comm_tot
        FROM public.cod_orders
        WHERE operation_id = p_operation_id
          AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_date_from AND p_date_to
        GROUP BY 1
    ),
    daily_traffic AS (
        -- Agregamos spend com conversão FX
        SELECT 
            date as t_date,
            SUM(
                CASE 
                    WHEN COALESCE(currency, 'USD') = 'USD' THEN spend * v_usd_rate
                    WHEN currency = 'EUR' THEN spend * v_eur_rate
                    WHEN currency = 'BRL' THEN spend
                    ELSE spend * v_usd_rate
                END
            ) as invest_brl
        FROM (
            -- Subquery para deduplicação básica se necessário, mas aqui somamos tudo da traffic_data para a operação
            SELECT date, spend, currency
            FROM public.traffic_data
            WHERE operation_id = p_operation_id
              AND date BETWEEN p_date_from AND p_date_to
        ) t
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
        CASE WHEN COALESCE(s.app, 0) > 0 THEN s.rev_app / s.app ELSE 0 END::numeric as ticket_avg_approved,
        CASE WHEN COALESCE(s.app, 0) > 0 THEN s.rev_tot / s.app ELSE 0 END::numeric as commission_avg_approved,
        v_avg_comm_7d::numeric as avg_comm_7d_brl,
        COALESCE(tr.invest_brl, 0)::numeric as invest_total_brl
    FROM date_series ds
    LEFT JOIN daily_stats s ON ds.d = s.o_date
    LEFT JOIN daily_traffic tr ON ds.d = tr.t_date
    ORDER BY ds.d DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v13 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v13 TO service_role;