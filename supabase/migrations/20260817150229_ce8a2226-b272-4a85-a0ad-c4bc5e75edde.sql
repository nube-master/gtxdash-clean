-- Drop existing functions before recreation to avoid OUT parameter type mismatch
DROP FUNCTION IF EXISTS get_cod_daily_pnl_v2(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_spend_normalized_sp_v2(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_total_traffic_metrics_v2(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_traffic_spend_by_account_v2(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_leaderboard_sales_v2(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_leaderboard_traffic_v2(UUID, DATE, DATE);

-- 1. get_cod_daily_pnl_v2
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
    COUNT(s.id) FILTER (WHERE s.status IN ('generated', 'pending', 'paid', 'delivered'))::BIGINT,
    COUNT(s.id) FILTER (WHERE s.status = 'delivered')::BIGINT,
    COALESCE(t.spend_brl, 0)::DECIMAL,
    COALESCE(SUM(s.total_amount_brl), 0)::DECIMAL,
    (COALESCE(SUM(s.total_amount_brl), 0) - COALESCE(t.spend_brl, 0))::DECIMAL,
    CASE 
      WHEN COALESCE(t.spend_brl, 0) > 0 
      THEN ((COALESCE(SUM(s.total_amount_brl), 0) - COALESCE(t.spend_brl, 0)) / t.spend_brl)::DECIMAL
      ELSE 0 
    END
  FROM sales_data s
  LEFT JOIN (
    SELECT td.date as t_date, td.operation_id as t_op_id, SUM(td.spend_brl) as spend_brl
    FROM traffic_data td
    WHERE td.operation_id = p_operation_id
    GROUP BY td.date, td.operation_id
  ) t ON s.date = t.t_date AND s.operation_id = t.t_op_id
  WHERE s.operation_id = p_operation_id
    AND s.date >= p_date_from
    AND s.date <= p_date_to
  GROUP BY s.date, s.operation_id, t.spend_brl
  ORDER BY s.date DESC;
END;
$$;

-- 2. get_spend_normalized_sp_v2
CREATE OR REPLACE FUNCTION get_spend_normalized_sp_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  res_date DATE,
  spend_brl DECIMAL,
  spend_usd DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.date as res_date,
    SUM(t.spend_brl)::DECIMAL,
    SUM(t.spend_usd)::DECIMAL
  FROM traffic_data t
  WHERE t.operation_id = p_operation_id
    AND t.date >= p_date_from
    AND t.date <= p_date_to
  GROUP BY t.date
  ORDER BY t.date DESC;
END;
$$;

-- 3. get_total_traffic_metrics_v2
CREATE OR REPLACE FUNCTION get_total_traffic_metrics_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  res_spend_brl DECIMAL,
  res_clicks BIGINT,
  res_impressions BIGINT,
  res_conversions BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(t.spend_brl), 0)::DECIMAL,
    COALESCE(SUM(t.clicks), 0)::BIGINT,
    COALESCE(SUM(t.impressions), 0)::BIGINT,
    COALESCE(SUM(t.conversions), 0)::BIGINT
  FROM traffic_data t
  WHERE t.operation_id = p_operation_id
    AND t.date >= p_date_from
    AND t.date <= p_date_to;
END;
$$;

-- 4. get_traffic_spend_by_account_v2
CREATE OR REPLACE FUNCTION get_traffic_spend_by_account_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  res_account_id TEXT,
  res_account_name TEXT,
  res_spend_brl DECIMAL,
  res_spend_usd DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.account_id as res_account_id,
    MAX(t.account_name) as res_account_name,
    SUM(t.spend_brl)::DECIMAL,
    SUM(t.spend_usd)::DECIMAL
  FROM traffic_data t
  WHERE t.operation_id = p_operation_id
    AND t.date >= p_date_from
    AND t.date <= p_date_to
  GROUP BY t.account_id
  ORDER BY SUM(t.spend_brl) DESC;
END;
$$;

-- 5. get_leaderboard_sales_v2
CREATE OR REPLACE FUNCTION get_leaderboard_sales_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  res_product_name TEXT,
  res_sales_count BIGINT,
  res_revenue_brl DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.product_name as res_product_name,
    COUNT(s.id)::BIGINT,
    SUM(s.total_amount_brl)::DECIMAL
  FROM sales_data s
  WHERE s.operation_id = p_operation_id
    AND s.date >= p_date_from
    AND s.date <= p_date_to
    AND s.status IN ('paid', 'delivered')
  GROUP BY s.product_name
  ORDER BY COUNT(s.id) DESC;
END;
$$;

-- 6. get_leaderboard_traffic_v2
CREATE OR REPLACE FUNCTION get_leaderboard_traffic_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  res_campaign_name TEXT,
  res_spend_brl DECIMAL,
  res_clicks BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.campaign_name as res_campaign_name,
    SUM(t.spend_brl)::DECIMAL,
    SUM(t.clicks)::BIGINT
  FROM traffic_data t
  WHERE t.operation_id = p_operation_id
    AND t.date >= p_date_from
    AND t.date <= p_date_to
  GROUP BY t.campaign_name
  ORDER BY SUM(t.spend_brl) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cod_daily_pnl_v2(UUID, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_spend_normalized_sp_v2(UUID, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_total_traffic_metrics_v2(UUID, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_traffic_spend_by_account_v2(UUID, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_leaderboard_sales_v2(UUID, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_leaderboard_traffic_v2(UUID, DATE, DATE) TO authenticated, service_role;
