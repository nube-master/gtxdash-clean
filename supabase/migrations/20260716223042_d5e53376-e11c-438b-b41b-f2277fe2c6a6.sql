-- =========================================================
-- Dashboard COD GTX v1 — cod_orders + view diária
-- =========================================================

CREATE TABLE public.cod_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE RESTRICT,
  platform text NOT NULL DEFAULT 'shphere',
  external_order_id text NOT NULL,
  product_key text,
  order_date date NOT NULL,
  delivery_date date,
  payment_date date,
  status text NOT NULL CHECK (status IN ('pending','delivered','canceled','refused','expired','paid','commission_approved')),
  order_value numeric(12,2),
  commission_value numeric(12,2),
  customer_country text,
  raw_payload jsonb NOT NULL,
  received_via text NOT NULL DEFAULT 'webhook' CHECK (received_via IN ('webhook','csv_import')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_order_id)
);

CREATE INDEX cod_orders_op_date_idx ON public.cod_orders (operation_id, order_date);
CREATE INDEX cod_orders_status_idx ON public.cod_orders (status);
CREATE INDEX cod_orders_delivery_date_idx ON public.cod_orders (delivery_date) WHERE delivery_date IS NOT NULL;
CREATE INDEX cod_orders_payment_date_idx ON public.cod_orders (payment_date) WHERE payment_date IS NOT NULL;

-- GRANTs (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_orders TO authenticated;
GRANT ALL ON public.cod_orders TO service_role;

-- RLS strict_op_scope (mesmo padrão de offers/traffic_data etc)
ALTER TABLE public.cod_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY strict_op_scope_select ON public.cod_orders
  FOR SELECT USING (public.strict_op_scope(operation_id));

CREATE POLICY strict_op_scope_insert ON public.cod_orders
  FOR INSERT WITH CHECK (public.strict_op_scope(operation_id));

CREATE POLICY strict_op_scope_update ON public.cod_orders
  FOR UPDATE USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));

CREATE POLICY strict_op_scope_delete ON public.cod_orders
  FOR DELETE USING (
    (public.strict_op_scope(operation_id) AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  );

-- updated_at trigger (reusa função pública existente)
CREATE TRIGGER cod_orders_set_updated_at
  BEFORE UPDATE ON public.cod_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.cod_orders IS
  'Pedidos Cash on Delivery (Shphere). ISOLADO: NÃO alimenta sales_data nem redtrack_events. Consumido apenas por /dashboard/cod.';

-- =========================================================
-- View diária: reconciliação por data de origem (accrual)
-- =========================================================

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

GRANT SELECT ON public.cod_daily_pnl_by_origin TO authenticated;
GRANT SELECT ON public.cod_daily_pnl_by_origin TO service_role;

COMMENT ON VIEW public.cod_daily_pnl_by_origin IS
  'Dashboard COD GTX v1 — reconciliação por data de origem (accrual). security_invoker=true herda RLS strict_op_scope de cod_orders. Invest filtrado por campaign_name ILIKE %COD% em traffic_data. Status: closed >=95%, partial 60-95%, open <60%.';
