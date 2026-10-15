
-- FIX 2: Add BRL columns and metadata
ALTER TABLE public.cod_orders 
  ADD COLUMN IF NOT EXISTS commission_value_brl NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS order_value_brl NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS fx_rate_used NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- Backfill existing FAHTO records (Operation ID: 8707b3f8-ab41-4a63-902c-9ab97fe50c8a)
-- Using 6.0402 as the definitive EUR-BRL rate confirm by Gabriel
UPDATE public.cod_orders
SET 
  commission_currency = 'EUR',
  fx_rate_used = 6.0402,
  commission_value_brl = ROUND(commission_value * 6.0402, 4),
  order_value_brl = ROUND(order_value * 6.0402, 4),
  converted_at = NOW()
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND commission_value IS NOT NULL;

-- FIX 3: Update RPC to v6 with global currency support
CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v6(
  p_operation_id UUID,
  p_date_from DATE,
  p_date_to DATE,
  p_display_currency TEXT DEFAULT 'BRL'
) RETURNS TABLE (
  res_date DATE,
  orders_generated BIGINT,
  orders_approved BIGINT,
  orders_expired BIGINT,
  orders_paid BIGINT,
  revenue_generated NUMERIC,
  revenue_approved NUMERIC,
  revenue_total NUMERIC,
  commission_generated NUMERIC
) LANGUAGE plpgsql AS $$
DECLARE
  v_fx_to_display NUMERIC := 1.0;
BEGIN
  -- Get FX Rate from BRL to p_display_currency
  IF p_display_currency <> 'BRL' THEN
    -- Try BRL -> TARGET
    SELECT rate INTO v_fx_to_display 
    FROM public.exchange_rates_cache
    WHERE base_currency = 'BRL' AND target_currency = p_display_currency
    ORDER BY fetched_at DESC LIMIT 1;

    -- If not found, try TARGET -> BRL and invert
    IF v_fx_to_display IS NULL THEN
      SELECT 1.0/rate INTO v_fx_to_display 
      FROM public.exchange_rates_cache
      WHERE base_currency = p_display_currency AND target_currency = 'BRL'
      ORDER BY fetched_at DESC LIMIT 1;
    END IF;

    -- Fallback to BRL (1.0) if still null
    IF v_fx_to_display IS NULL THEN
      v_fx_to_display := 1.0;
    END IF;
  END IF;

  RETURN QUERY
  WITH daily_stats AS (
    SELECT 
      order_date::DATE as d,
      COUNT(*) FILTER (WHERE status = 'pending') as gen_count,
      COUNT(*) FILTER (WHERE status IN ('commission_approved', 'delivered', 'paid')) as app_count,
      COUNT(*) FILTER (WHERE status = 'expired') as exp_count,
      COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
      SUM(CASE WHEN status = 'pending' THEN COALESCE(order_value_brl, order_value) ELSE 0 END) as rev_gen_brl,
      SUM(CASE WHEN status IN ('commission_approved', 'delivered', 'paid') THEN COALESCE(order_value_brl, order_value) ELSE 0 END) as rev_app_brl,
      SUM(CASE WHEN status IN ('commission_approved', 'delivered', 'paid') THEN COALESCE(commission_value_brl, commission_value) ELSE 0 END) as com_paid_brl,
      SUM(CASE WHEN status = 'pending' THEN COALESCE(commission_value_brl, commission_value) ELSE 0 END) as com_gen_brl
    FROM public.cod_orders
    WHERE operation_id = p_operation_id
      AND order_date::DATE BETWEEN p_date_from AND p_date_to
    GROUP BY 1
  )
  SELECT 
    d,
    gen_count,
    app_count,
    exp_count,
    paid_count,
    (rev_gen_brl * v_fx_to_display)::NUMERIC,
    (rev_app_brl * v_fx_to_display)::NUMERIC,
    (com_paid_brl * v_fx_to_display)::NUMERIC,
    (com_gen_brl * v_fx_to_display)::NUMERIC
  FROM daily_stats
  ORDER BY d DESC;
END;
$$;
