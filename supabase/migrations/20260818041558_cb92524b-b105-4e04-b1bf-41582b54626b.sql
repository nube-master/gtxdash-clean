DROP FUNCTION IF EXISTS public.get_cod_daily_pnl_v5(uuid,date,date);

CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v5(p_operation_id uuid, p_date_from date, p_date_to date)
 RETURNS TABLE(
    res_date text, 
    orders_generated bigint, 
    orders_approved bigint, 
    orders_paid bigint, 
    orders_pending bigint, 
    orders_expired bigint, 
    revenue_generated numeric, 
    revenue_approved numeric, 
    revenue_total numeric, 
    commission_generated numeric, 
    commission_paid numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    to_char(o.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS res_date,
    -- GERADOS: Apenas pedidos que ainda estão aguardando (pending)
    COUNT(*) FILTER (WHERE o.status = 'pending') AS orders_generated,
    -- APROVADOS: Vendas confirmadas no call center
    COUNT(*) FILTER (WHERE o.status IN ('commission_approved', 'delivered', 'paid')) AS orders_approved,
    COUNT(*) FILTER (WHERE o.status = 'paid') AS orders_paid,
    COUNT(*) FILTER (WHERE o.status IN ('pending', 'processing')) AS orders_pending,
    COUNT(*) FILTER (WHERE o.status = 'expired') AS orders_expired,
    -- Valores financeiros seguem a mesma lógica
    SUM(COALESCE(o.order_value, 0)) FILTER (WHERE o.status = 'pending') AS revenue_generated,
    SUM(COALESCE(o.order_value, 0)) FILTER (WHERE o.status IN ('commission_approved', 'delivered', 'paid')) AS revenue_approved,
    SUM(COALESCE(o.commission_value, 0)) FILTER (WHERE o.status IN ('commission_approved', 'delivered', 'paid')) AS revenue_total,
    SUM(COALESCE(o.commission_value, 0)) FILTER (WHERE o.status = 'pending') AS commission_generated,
    SUM(COALESCE(o.commission_value, 0)) FILTER (WHERE o.status = 'paid') AS commission_paid
  FROM public.cod_orders o
  WHERE o.operation_id = p_operation_id
    AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_date_from AND p_date_to
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$function$;