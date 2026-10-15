-- FASE P0.1 — FIX IMEDIATO PUSHCUT (Orphan management)
-- 1. Marcar rows órfãos (operation_id NULL) como INVALID
ALTER TABLE notification_recipients ADD COLUMN IF NOT EXISTS is_orphan 
  BOOLEAN GENERATED ALWAYS AS (operation_id IS NULL) STORED;

-- 2. Force NOT NULL a partir daqui
-- Desativamos quem não tem operação vinculada para evitar vazamentos
UPDATE notification_recipients 
SET is_active = false 
WHERE operation_id IS NULL;

-- Vinculamos a uma operação fallback para o NOT NULL (is_active já está false)
DO $$
DECLARE
    fallback_op_id UUID;
BEGIN
    SELECT id INTO fallback_op_id FROM operations WHERE status = 'active' LIMIT 1;
    IF fallback_op_id IS NOT NULL THEN
        UPDATE notification_recipients 
        SET operation_id = fallback_op_id
        WHERE operation_id IS NULL;
    END IF;
END $$;

ALTER TABLE notification_recipients ALTER COLUMN operation_id SET NOT NULL;

-- FASE P0.2 — FIX RPCs FINANCEIRAS (Novas versões V2 com p_operation_id)

-- 1. get_cod_daily_pnl_v2
CREATE OR REPLACE FUNCTION get_cod_daily_pnl_v2(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  date DATE,
  operation_id UUID,
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
    s.date,
    s.operation_id,
    COUNT(s.id) FILTER (WHERE s.status IN ('generated', 'pending', 'paid', 'delivered'))::BIGINT as orders_generated,
    COUNT(s.id) FILTER (WHERE s.status = 'delivered')::BIGINT as orders_delivered,
    COALESCE(SUM(t.spend_brl), 0)::DECIMAL as invest_total,
    COALESCE(SUM(s.total_amount_brl), 0)::DECIMAL as revenue_total,
    (COALESCE(SUM(s.total_amount_brl), 0) - COALESCE(SUM(t.spend_brl), 0))::DECIMAL as net_profit,
    CASE 
      WHEN COALESCE(SUM(t.spend_brl), 0) > 0 
      THEN ((COALESCE(SUM(s.total_amount_brl), 0) - COALESCE(SUM(t.spend_brl), 0)) / SUM(t.spend_brl))::DECIMAL
      ELSE 0 
    END as roi
  FROM sales_data s
  LEFT JOIN (
    SELECT date, operation_id, SUM(spend_brl) as spend_brl
    FROM traffic_data
    WHERE operation_id = p_operation_id
    GROUP BY date, operation_id
  ) t ON s.date = t.date AND s.operation_id = t.operation_id
  WHERE s.operation_id = p_operation_id
    AND s.date >= p_date_from
    AND s.date <= p_date_to
  GROUP BY s.date, s.operation_id
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
  date DATE,
  spend_brl DECIMAL,
  spend_usd DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.date,
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
  spend_brl DECIMAL,
  clicks BIGINT,
  impressions BIGINT,
  conversions BIGINT
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
  account_id TEXT,
  account_name TEXT,
  spend_brl DECIMAL,
  spend_usd DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.account_id,
    MAX(t.account_name) as account_name,
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
  product_name TEXT,
  sales_count BIGINT,
  revenue_brl DECIMAL
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.product_name,
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
  campaign_name TEXT,
  spend_brl DECIMAL,
  clicks BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.campaign_name,
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

-- GRANTs para as novas funções
GRANT EXECUTE ON FUNCTION get_cod_daily_pnl_v2 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_spend_normalized_sp_v2 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_total_traffic_metrics_v2 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_traffic_spend_by_account_v2 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_leaderboard_sales_v2 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_leaderboard_traffic_v2 TO authenticated, service_role;
