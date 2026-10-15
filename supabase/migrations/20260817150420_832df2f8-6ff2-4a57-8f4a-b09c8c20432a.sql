-- 1. get_cod_daily_pnl_v2 (Updated statuses to include 'approved')
CREATE OR REPLACE FUNCTION get_cod_daily_pnl_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  res_date DATE,
  res_operation_id UUID,
  orders_generated BIGINT,
  orders_delivered BIGINT,
  invest_total DECIMAL,
  revenue_total DECIMAL,
  net_profit DECIMAL,
  roi DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.date as res_date,
    s.operation_id as res_operation_id,
    COUNT(s.id) FILTER (WHERE s.status IN ('generated', 'pending', 'paid', 'delivered', 'approved'))::BIGINT,
    COUNT(s.id) FILTER (WHERE s.status = 'delivered')::BIGINT,
    COALESCE(t.total_spend, 0)::DECIMAL,
    COALESCE(SUM(s.revenue), 0)::DECIMAL,
    (COALESCE(SUM(s.revenue), 0) - COALESCE(t.total_spend, 0))::DECIMAL,
    CASE 
      WHEN COALESCE(t.total_spend, 0) > 0 
      THEN ((COALESCE(SUM(s.revenue), 0) - COALESCE(t.total_spend, 0)) / t.total_spend)::DECIMAL
      ELSE 0 
    END
  FROM sales_data s
  LEFT JOIN (
    SELECT td.date as t_date, td.operation_id as t_op_id, SUM(td.spend) as total_spend
    FROM traffic_data td
    WHERE td.operation_id = p_operation_id
    GROUP BY td.date, td.operation_id
  ) t ON s.date = t.t_date AND s.operation_id = t.t_op_id
  WHERE s.operation_id = p_operation_id
    AND s.date >= p_date_from
    AND s.date <= p_date_to
  GROUP BY s.date, s.operation_id, t.total_spend
  ORDER BY s.date DESC;
END;
$$;
