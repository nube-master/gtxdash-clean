DROP FUNCTION IF EXISTS public.get_cod_daily_pnl(date, date);

CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl(p_start_date date, p_end_date date)
 RETURNS TABLE(order_date date, operation_id uuid, orders_generated bigint, invest_total numeric, revenue_total numeric, net_profit numeric, arpu numeric, connect_rate numeric, roi numeric, meta_cpa numeric, meta_ic bigint, meta_clicks bigint, meta_impressions bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH daily_stats AS (
        SELECT 
            d.date::date as d_date,
            op.id as op_id,
            CASE 
                WHEN op.name ILIKE '%FAHTO%' OR op.name ILIKE '%FATO%' THEN 'AURAVITA|Aeterna|HT|\[COD\]'
                WHEN op.name ILIKE '%GTX%' THEN 'GTX|NEURO|LDR|CRT|NDM'
                ELSE '.*'
            END as pattern
        FROM (SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date as date) d
        CROSS JOIN public.operations op
    ),
    traffic AS (
        SELECT 
            t.date,
            t.operation_id,
            SUM(t.spend) as total_spend,
            SUM(t.fb_pixel_initiate_checkout) as total_ic,
            SUM(t.clicks) as total_clicks,
            SUM(t.impressions) as total_impressions
        FROM public.traffic_data t
        JOIN daily_stats ds ON t.date = ds.d_date AND t.operation_id = ds.op_id
        WHERE t.campaign_name ~* ds.pattern
        GROUP BY t.date, t.operation_id
    ),
    orders AS (
        SELECT 
            (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date as o_date,
            s.operation_id,
            COUNT(*) as total_orders,
            SUM(revenue) as total_revenue
        FROM public.sales_data s
        WHERE created_at >= p_start_date AND created_at <= p_end_date + interval '1 day'
        GROUP BY 1, s.operation_id
    )
    SELECT 
        ds.d_date,
        ds.op_id,
        COALESCE(o.total_orders, 0),
        COALESCE(tr.total_spend, 0)::numeric,
        COALESCE(o.total_revenue, 0)::numeric,
        (COALESCE(o.total_revenue, 0) - COALESCE(tr.total_spend, 0) - (COALESCE(o.total_revenue, 0) * 0.1765))::numeric,
        (CASE WHEN COALESCE(o.total_orders, 0) > 0 THEN COALESCE(o.total_revenue, 0) / o.total_orders ELSE 0 END)::numeric,
        0.0::numeric,
        (CASE WHEN COALESCE(tr.total_spend, 0) > 0 THEN (COALESCE(o.total_revenue, 0) / tr.total_spend) ELSE 0 END)::numeric,
        (CASE WHEN COALESCE(o.total_orders, 0) > 0 THEN COALESCE(tr.total_spend, 0) / o.total_orders ELSE 0 END)::numeric,
        COALESCE(tr.total_ic, 0)::bigint,
        COALESCE(tr.total_clicks, 0)::bigint,
        COALESCE(tr.total_impressions, 0)::bigint
    FROM daily_stats ds
    LEFT JOIN traffic tr ON ds.d_date = tr.date AND ds.op_id = tr.operation_id
    LEFT JOIN orders o ON ds.d_date = o.o_date AND ds.op_id = o.operation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl(date, date) TO service_role;