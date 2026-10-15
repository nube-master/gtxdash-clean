
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
  SELECT COALESCE(SUM(amount_brl), 0) INTO v_lot_topups FROM treasury_topups WHERE provider = 'lot';
  SELECT COALESCE(SUM(amount_brl), 0) INTO v_lot_charges FROM daily_card_charges WHERE card_provider = 'lot';
  v_lot_balance := v_lot_topups - v_lot_charges;

  SELECT COALESCE(SUM(amount_brl), 0) INTO v_payoneer_topups FROM treasury_topups WHERE provider = 'payoneer';
  SELECT COALESCE(SUM(amount_brl), 0) INTO v_payoneer_charges FROM daily_card_charges WHERE card_provider = 'payoneer';
  v_payoneer_balance := v_payoneer_topups - v_payoneer_charges;

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

  -- Histórico 30d
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', h.charge_date::text,
    'card_provider', h.card_provider,
    'total_brl', h.total_brl,
    'count', h.count
  ) ORDER BY h.charge_date), '[]'::jsonb) INTO v_history
  FROM (
    SELECT 
      charge_date,
      card_provider,
      SUM(amount_brl) AS total_brl,
      COUNT(*) AS count
    FROM daily_card_charges
    WHERE charge_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY charge_date, card_provider
  ) h;

  -- Forecast 30d
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', d.day::date::text,
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
