-- Update fallback rate to real commercial rate
UPDATE public.app_settings
SET value = '{"rate": 5.8318}'::jsonb, updated_at = now()
WHERE key = 'cod_eur_brl_rate';

-- Rewrite RPC to read live EUR->BRL from exchange_rates_cache
CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl(_from date, _to date)
RETURNS TABLE (
  operation_id uuid,
  order_date date,
  orders_generated bigint,
  orders_delivered bigint,
  orders_canceled bigint,
  orders_refused bigint,
  orders_expired bigint,
  delivery_rate numeric,
  commission_total numeric,
  order_value_total numeric,
  invest_total numeric,
  profit_of_day numeric,
  day_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eur_brl numeric;
BEGIN
  -- 1st: live cache (updated by get-exchange-rate: awesomeapi/BCB/Frankfurter)
  SELECT rate INTO v_eur_brl
  FROM public.exchange_rates_cache
  WHERE base_currency = 'EUR' AND target_currency = 'BRL'
  LIMIT 1;

  -- 2nd: app_settings fallback
  IF v_eur_brl IS NULL OR v_eur_brl <= 0 THEN
    SELECT COALESCE((value->>'rate')::numeric, 5.83)
      INTO v_eur_brl
    FROM public.app_settings
    WHERE key = 'cod_eur_brl_rate'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_eur_brl IS NULL OR v_eur_brl <= 0 THEN v_eur_brl := 5.83; END IF;

  RETURN QUERY
  WITH orders_agg AS (
    SELECT
      co.operation_id,
      co.order_date,
      COUNT(*)::bigint AS orders_generated,
      COUNT(*) FILTER (WHERE co.status IN ('delivered','commission_approved','paid'))::bigint AS orders_delivered,
      COUNT(*) FILTER (WHERE co.status = 'canceled')::bigint AS orders_canceled,
      COUNT(*) FILTER (WHERE co.status = 'refused')::bigint AS orders_refused,
      COUNT(*) FILTER (WHERE co.status = 'expired')::bigint AS orders_expired,
      SUM(
        COALESCE(co.commission_value,0)
        * CASE WHEN COALESCE(co.commission_currency,'EUR') = 'EUR' THEN v_eur_brl ELSE 1 END
      ) FILTER (WHERE co.status IN ('delivered','commission_approved','paid')) AS commission_total,
      SUM(COALESCE(co.order_value,0)) AS order_value_total
    FROM public.cod_orders co
    WHERE co.order_date BETWEEN _from AND _to
    GROUP BY co.operation_id, co.order_date
  ),
  spend_agg AS (
    SELECT td.operation_id, td.date_start AS order_date, SUM(COALESCE(td.spend,0)) AS invest_total
    FROM public.traffic_data td
    WHERE td.date_start BETWEEN _from AND _to
    GROUP BY td.operation_id, td.date_start
  )
  SELECT
    o.operation_id,
    o.order_date,
    o.orders_generated,
    o.orders_delivered,
    o.orders_canceled,
    o.orders_refused,
    o.orders_expired,
    CASE WHEN o.orders_generated > 0
      THEN ROUND(o.orders_delivered::numeric / o.orders_generated::numeric, 4)
      ELSE 0 END AS delivery_rate,
    COALESCE(o.commission_total, 0) AS commission_total,
    COALESCE(o.order_value_total, 0) AS order_value_total,
    COALESCE(s.invest_total, 0) AS invest_total,
    COALESCE(o.commission_total, 0) - COALESCE(s.invest_total, 0) AS profit_of_day,
    CASE
      WHEN o.order_date < CURRENT_DATE - INTERVAL '10 days' THEN 'closed'
      WHEN o.order_date < CURRENT_DATE THEN 'partial'
      ELSE 'open'
    END AS day_status
  FROM orders_agg o
  LEFT JOIN spend_agg s
    ON s.operation_id = o.operation_id AND s.order_date = o.order_date
  ORDER BY o.order_date DESC;
END;
$$;