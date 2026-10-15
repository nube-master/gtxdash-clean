CREATE OR REPLACE VIEW public.cod_daily_pnl_by_origin
WITH (security_invoker = true) AS
WITH orders_agg AS (
  SELECT
    co.operation_id,
    co.order_date,
    COUNT(*) AS orders_generated,
    COUNT(*) FILTER (WHERE co.status IN ('delivered','paid','commission_approved')) AS orders_delivered,
    COUNT(*) FILTER (WHERE co.status = 'canceled') AS orders_canceled,
    COUNT(*) FILTER (WHERE co.status = 'refused') AS orders_refused,
    COUNT(*) FILTER (WHERE co.status = 'expired') AS orders_expired,
    COUNT(*) FILTER (WHERE co.status IN ('delivered','paid','commission_approved','canceled','refused','expired')) AS orders_resolved,
    COALESCE(SUM(co.commission_value) FILTER (WHERE co.status IN ('delivered','paid','commission_approved')), 0) AS commission_total,
    COALESCE(SUM(co.order_value) FILTER (WHERE co.status IN ('delivered','paid','commission_approved')), 0) AS order_value_total
  FROM public.cod_orders co
  GROUP BY co.operation_id, co.order_date
),
invest_agg AS (
  SELECT
    td.operation_id,
    td.date AS order_date,
    COALESCE(SUM(td.spend), 0) AS invest_total
  FROM public.traffic_data td
  WHERE td.campaign_name ILIKE '%COD%'
    AND (td.operation_id, td.date) IN (SELECT operation_id, order_date FROM orders_agg)
  GROUP BY td.operation_id, td.date
)
SELECT
  o.operation_id,
  o.order_date,
  o.orders_generated,
  o.orders_delivered,
  o.orders_canceled,
  o.orders_refused,
  o.orders_expired,
  CASE WHEN o.orders_generated = 0 THEN 0
       ELSE ROUND(o.orders_delivered::numeric / o.orders_generated::numeric, 4)
  END AS delivery_rate,
  o.commission_total,
  o.order_value_total,
  COALESCE(i.invest_total, 0) AS invest_total,
  o.commission_total - COALESCE(i.invest_total, 0) AS profit_of_day,
  CASE
    WHEN o.orders_generated = 0 THEN 'closed'
    WHEN (o.orders_resolved::numeric / o.orders_generated::numeric) >= 0.95 THEN 'closed'
    WHEN (o.orders_resolved::numeric / o.orders_generated::numeric) >= 0.60 THEN 'partial'
    ELSE 'open'
  END AS day_status
FROM orders_agg o
LEFT JOIN invest_agg i
  ON i.operation_id = o.operation_id AND i.order_date = o.order_date;