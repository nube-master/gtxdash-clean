CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v3(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
) RETURNS TABLE (
  res_date DATE,
  orders_generated BIGINT,
  revenue_generated NUMERIC(12,2),
  orders_approved BIGINT,
  revenue_approved NUMERIC(12,2),
  orders_delivered BIGINT,
  revenue_delivered NUMERIC(12,2),
  orders_expired BIGINT,
  revenue_total NUMERIC(12,2),
  commission_generated NUMERIC(12,2)
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.created_at::date AS res_date,
    COUNT(*) FILTER (
      WHERE o.status IN ('pending', 'generated', 'commission_approved', 'delivered', 'approved', 'paid')
    )::BIGINT AS orders_generated,
    COALESCE(SUM(o.order_value) FILTER (
      WHERE o.status IN ('pending', 'generated', 'commission_approved', 'delivered', 'approved', 'paid')
    ), 0)::NUMERIC(12,2) AS revenue_generated,
    COUNT(*) FILTER (WHERE o.status IN ('commission_approved', 'approved', 'paid'))::BIGINT AS orders_approved,
    COALESCE(SUM(o.order_value) FILTER (WHERE o.status IN ('commission_approved', 'approved', 'paid')), 0)::NUMERIC(12,2) AS revenue_approved,
    COUNT(*) FILTER (WHERE o.status = 'delivered')::BIGINT AS orders_delivered,
    COALESCE(SUM(o.order_value) FILTER (WHERE o.status = 'delivered'), 0)::NUMERIC(12,2) AS revenue_delivered,
    COUNT(*) FILTER (WHERE o.status = 'expired')::BIGINT AS orders_expired,
    COALESCE(SUM(o.commission_value) FILTER (WHERE o.status = 'delivered'), 0)::NUMERIC(12,2) AS revenue_total,
    COALESCE(SUM(o.commission_value) FILTER (
      WHERE o.status IN ('pending', 'generated', 'commission_approved', 'delivered', 'approved', 'paid')
    ), 0)::NUMERIC(12,2) AS commission_generated
  FROM cod_orders o
  WHERE o.operation_id = p_operation_id
    AND o.created_at::date BETWEEN p_date_from AND p_date_to
  GROUP BY o.created_at::date
  ORDER BY o.created_at::date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v3(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v3(UUID, DATE, DATE) TO service_role;
