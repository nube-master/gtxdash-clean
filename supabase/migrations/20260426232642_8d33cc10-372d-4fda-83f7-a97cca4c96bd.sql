
-- =====================================================
-- TREASURY TOPUPS: registra aportes em cards Lot/Payoneer
-- =====================================================
CREATE TABLE IF NOT EXISTS public.treasury_topups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('lot', 'payoneer')),
  topup_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fx_rate NUMERIC,
  amount_brl NUMERIC NOT NULL,
  reference TEXT,
  notes TEXT,
  created_by UUID,
  operation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_topups_provider_date 
  ON public.treasury_topups (provider, topup_date DESC);

ALTER TABLE public.treasury_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read treasury_topups"
  ON public.treasury_topups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert treasury_topups"
  ON public.treasury_topups FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update treasury_topups"
  ON public.treasury_topups FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete treasury_topups"
  ON public.treasury_topups FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_treasury_topups_updated_at
  BEFORE UPDATE ON public.treasury_topups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- get_treasury_overview: saldos + histórico 30d + forecast 7d-MA
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_treasury_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_lot_topups numeric;
  v_lot_charges numeric;
  v_lot_balance numeric;
  v_payoneer_topups numeric;
  v_payoneer_charges numeric;
  v_payoneer_balance numeric;
  v_lot_avg_7d numeric;
  v_payoneer_avg_7d numeric;
  v_history jsonb;
  v_forecast jsonb;
BEGIN
  -- Saldos Lot
  SELECT COALESCE(SUM(amount_brl), 0) INTO v_lot_topups
  FROM treasury_topups WHERE provider = 'lot';

  SELECT COALESCE(SUM(amount_brl), 0) INTO v_lot_charges
  FROM daily_card_charges WHERE card_provider = 'lot';

  v_lot_balance := v_lot_topups - v_lot_charges;

  -- Saldos Payoneer
  SELECT COALESCE(SUM(amount_brl), 0) INTO v_payoneer_topups
  FROM treasury_topups WHERE provider = 'payoneer';

  SELECT COALESCE(SUM(amount_brl), 0) INTO v_payoneer_charges
  FROM daily_card_charges WHERE card_provider = 'payoneer';

  v_payoneer_balance := v_payoneer_topups - v_payoneer_charges;

  -- Média 7d (cashburn diário)
  SELECT COALESCE(AVG(daily_total), 0) INTO v_lot_avg_7d FROM (
    SELECT charge_date, SUM(amount_brl) AS daily_total
    FROM daily_card_charges
    WHERE card_provider = 'lot'
      AND charge_date >= CURRENT_DATE - INTERVAL '7 days'
      AND charge_date < CURRENT_DATE
    GROUP BY charge_date
  ) d;

  SELECT COALESCE(AVG(daily_total), 0) INTO v_payoneer_avg_7d FROM (
    SELECT charge_date, SUM(amount_brl) AS daily_total
    FROM daily_card_charges
    WHERE card_provider = 'payoneer'
      AND charge_date >= CURRENT_DATE - INTERVAL '7 days'
      AND charge_date < CURRENT_DATE
    GROUP BY charge_date
  ) d;

  -- Histórico 30d (cobranças por provider/dia)
  SELECT COALESCE(jsonb_agg(row_to_json(h) ORDER BY (h->>'date')::date), '[]'::jsonb) INTO v_history
  FROM (
    SELECT 
      charge_date::text AS date,
      card_provider,
      SUM(amount_brl) AS total_brl,
      COUNT(*) AS count
    FROM daily_card_charges
    WHERE charge_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY charge_date, card_provider
    ORDER BY charge_date
  ) h;

  -- Forecast 30d (média 7d projetada para próximos 30 dias)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', d.day::text,
    'lot_projected_brl', v_lot_avg_7d,
    'payoneer_projected_brl', v_payoneer_avg_7d,
    'total_projected_brl', v_lot_avg_7d + v_payoneer_avg_7d
  ) ORDER BY d.day), '[]'::jsonb) INTO v_forecast
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '29 days', '1 day'::interval) AS d(day);

  result := jsonb_build_object(
    'balances', jsonb_build_object(
      'lot', jsonb_build_object(
        'topups_brl', v_lot_topups,
        'charges_brl', v_lot_charges,
        'balance_brl', v_lot_balance,
        'avg_burn_7d_brl', v_lot_avg_7d,
        'days_runway', CASE WHEN v_lot_avg_7d > 0 THEN (v_lot_balance / v_lot_avg_7d) ELSE NULL END
      ),
      'payoneer', jsonb_build_object(
        'topups_brl', v_payoneer_topups,
        'charges_brl', v_payoneer_charges,
        'balance_brl', v_payoneer_balance,
        'avg_burn_7d_brl', v_payoneer_avg_7d,
        'days_runway', CASE WHEN v_payoneer_avg_7d > 0 THEN (v_payoneer_balance / v_payoneer_avg_7d) ELSE NULL END
      ),
      'total', jsonb_build_object(
        'topups_brl', v_lot_topups + v_payoneer_topups,
        'charges_brl', v_lot_charges + v_payoneer_charges,
        'balance_brl', v_lot_balance + v_payoneer_balance,
        'avg_burn_7d_brl', v_lot_avg_7d + v_payoneer_avg_7d
      )
    ),
    'history_30d', v_history,
    'forecast_30d', v_forecast,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_treasury_overview() TO authenticated;

-- =====================================================
-- get_meta_balances_consolidated: Meta accounts por moeda
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_meta_balances_consolidated()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'by_currency', COALESCE(jsonb_agg(row_to_json(c) ORDER BY (c->>'total_balance')::numeric DESC), '[]'::jsonb),
    'total_accounts', (SELECT COUNT(*) FROM meta_account_financials),
    'low_balance_count', (
      SELECT COUNT(*) FROM meta_account_financials 
      WHERE COALESCE(account_balance, 0) < 100 AND COALESCE(account_balance, 0) > 0
    ),
    'generated_at', now()
  ) INTO result
  FROM (
    SELECT 
      currency,
      COUNT(*) AS account_count,
      SUM(COALESCE(account_balance, 0)) AS total_balance,
      SUM(COALESCE(amount_spent, 0)) AS total_spent,
      AVG(COALESCE(account_balance, 0))::numeric(20,2) AS avg_balance
    FROM meta_account_financials
    GROUP BY currency
  ) c;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_meta_balances_consolidated() TO authenticated;

-- =====================================================
-- Default low balance thresholds
-- =====================================================
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'treasury_low_balance_thresholds',
  jsonb_build_object(
    'lot_brl', 5000,
    'payoneer_brl', 5000,
    'meta_account_usd', 100,
    'meta_account_brl', 500
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
