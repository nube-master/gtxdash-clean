
CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v8(
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
   orders_paid bigint, 
   orders_pending bigint, 
   revenue_generated numeric, 
   revenue_approved numeric, 
   revenue_total numeric, 
   commission_generated numeric, 
   ticket_avg_approved numeric, 
   commission_avg_approved numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fx_to_display NUMERIC := 1.0;
BEGIN
  -- Get FX Rate from BRL to p_display_currency
  IF p_display_currency <> 'BRL' THEN
    SELECT rate INTO v_fx_to_display 
    FROM public.exchange_rates_cache
    WHERE base_currency = 'BRL' AND target_currency = p_display_currency
    ORDER BY fetched_at DESC LIMIT 1;

    IF v_fx_to_display IS NULL THEN
      SELECT 1.0/rate INTO v_fx_to_display 
      FROM public.exchange_rates_cache
      WHERE base_currency = p_display_currency AND target_currency = 'BRL'
      ORDER BY fetched_at DESC LIMIT 1;
    END IF;

    IF v_fx_to_display IS NULL THEN v_fx_to_display := 1.0; END IF;
  END IF;

  RETURN QUERY
  WITH daily_stats AS (
    SELECT 
      (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::DATE as d,
      COUNT(*) AS gen_count,
      COUNT(*) FILTER (WHERE status IN ('commission_approved', 'delivered', 'paid')) as app_count,
      COUNT(*) FILTER (WHERE status = 'expired') as exp_count,
      COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
      COUNT(*) FILTER (WHERE status = 'pending') as pend_count,
      SUM(COALESCE(order_value_brl, order_value)) as rev_gen_brl,
      SUM(CASE WHEN status IN ('commission_approved', 'delivered', 'paid') THEN COALESCE(order_value_brl, order_value) ELSE 0 END) as rev_app_brl,
      SUM(CASE WHEN status IN ('commission_approved', 'delivered', 'paid') THEN COALESCE(commission_value_brl, commission_value) ELSE 0 END) as com_paid_brl,
      SUM(COALESCE(commission_value_brl, commission_value)) as com_gen_brl
    FROM public.cod_orders o
    WHERE operation_id = p_operation_id
      AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_date_from AND p_date_to
    GROUP BY 1
  )
  SELECT 
    d,
    gen_count,
    app_count,
    exp_count,
    paid_count,
    pend_count,
    (rev_gen_brl * v_fx_to_display)::NUMERIC,
    (rev_app_brl * v_fx_to_display)::NUMERIC,
    (com_paid_brl * v_fx_to_display)::NUMERIC,
    (com_gen_brl * v_fx_to_display)::NUMERIC,
    CASE WHEN app_count > 0 THEN (rev_app_brl * v_fx_to_display / app_count)::NUMERIC ELSE 0 END,
    CASE WHEN app_count > 0 THEN (com_paid_brl * v_fx_to_display / app_count)::NUMERIC ELSE 0 END
  FROM daily_stats
  ORDER BY d DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v8(uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v8(uuid, date, date, text) TO service_role;
