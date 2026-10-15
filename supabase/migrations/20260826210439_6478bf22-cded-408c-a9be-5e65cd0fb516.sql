CREATE TABLE public.space_commission_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE,
  commission_pct NUMERIC NOT NULL DEFAULT 0,
  base_formula TEXT NOT NULL DEFAULT 'net_profit',
  includes_taxes BOOLEAN NOT NULL DEFAULT true,
  includes_account_rental BOOLEAN NOT NULL DEFAULT true,
  includes_other_costs BOOLEAN NOT NULL DEFAULT false,
  other_costs_brl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT space_commission_base_formula_chk CHECK (base_formula IN ('net_profit','gross_profit')),
  CONSTRAINT space_commission_pct_chk CHECK (commission_pct >= 0 AND commission_pct <= 100)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.space_commission_config TO authenticated;
GRANT ALL ON public.space_commission_config TO service_role;
ALTER TABLE public.space_commission_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins manage space commission config"
ON public.space_commission_config FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.space_commission_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.space_commission_config_history TO authenticated;
GRANT ALL ON public.space_commission_config_history TO service_role;
ALTER TABLE public.space_commission_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read space commission history"
ON public.space_commission_config_history FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.space_commission_config_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  INSERT INTO public.space_commission_config_history (operation_id, old_values, new_values, changed_by)
  VALUES (
    NEW.operation_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    auth.uid()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_space_commission_config_audit
BEFORE INSERT OR UPDATE ON public.space_commission_config
FOR EACH ROW EXECUTE FUNCTION public.space_commission_config_audit();

CREATE OR REPLACE FUNCTION public.get_commission_calc(
  p_operation_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cfg public.space_commission_config%ROWTYPE;
  v_spend NUMERIC := 0;
  v_revenue NUMERIC := 0;
  v_live_spend NUMERIC := 0;
  v_live_rev NUMERIC := 0;
  v_fx NUMERIC;
  v_taxes NUMERIC := 0;
  v_rental NUMERIC := 0;
  v_other NUMERIC := 0;
  v_base NUMERIC := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.space_commission_config WHERE operation_id = p_operation_id;

  SELECT COALESCE(SUM(total_spend),0), COALESCE(SUM(total_revenue),0)
    INTO v_spend, v_revenue
    FROM public.daily_totals_snapshot
   WHERE operation_id = p_operation_id
     AND date >= p_start AND date < LEAST(p_end + 1, v_today);

  IF p_end >= v_today THEN
    SELECT GREATEST(
      COALESCE((SELECT SUM(spend_brl) FROM public.meta_spend_realtime_safe WHERE operation_id = p_operation_id AND sp_date = v_today),0),
      COALESCE((SELECT SUM(spend_brl) FROM public.traffic_data WHERE operation_id = p_operation_id AND date = v_today),0),
      COALESCE((SELECT SUM(spend_brl) FROM public.traffic_data_hourly WHERE operation_id = p_operation_id AND date = v_today),0)
    ) INTO v_live_spend;

    SELECT COALESCE((SELECT rate_avg FROM public.exchange_rates_daily
                      WHERE currency_from='USD' AND currency_to='BRL' AND rate_date <= v_today
                      ORDER BY rate_date DESC LIMIT 1), 5.15) INTO v_fx;

    SELECT GREATEST(
      COALESCE((SELECT SUM(revenue) FROM public.sales_data
                 WHERE operation_id = p_operation_id AND date = v_today
                   AND COALESCE(status,'') NOT IN ('refunded','chargeback','canceled')),0),
      COALESCE((SELECT SUM(CASE WHEN upper(COALESCE(currency,'USD'))='USD' THEN amount * v_fx ELSE amount END)
                  FROM public.redtrack_events
                 WHERE operation_id = p_operation_id AND event_type = 'purchase'
                   AND occurred_at >= (v_today::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
                   AND occurred_at <  ((v_today + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'),0)
    ) INTO v_live_rev;

    v_spend := v_spend + COALESCE(v_live_spend,0);
    v_revenue := v_revenue + COALESCE(v_live_rev,0);
  END IF;

  IF v_cfg.id IS NULL THEN
    RETURN jsonb_build_object(
      'configured', false,
      'revenue', ROUND(v_revenue,2),
      'spend', ROUND(v_spend,2),
      'taxes', 0, 'rental', 0, 'other_costs', 0,
      'base', 0, 'pct', 0, 'valor_comissao', 0,
      'base_formula', NULL
    );
  END IF;

  IF v_cfg.base_formula = 'net_profit' THEN
    IF v_cfg.includes_taxes THEN v_taxes := v_revenue * 0.1215; END IF;
    IF v_cfg.includes_account_rental THEN v_rental := v_spend * 0.055; END IF;
    IF v_cfg.includes_other_costs THEN v_other := COALESCE(v_cfg.other_costs_brl,0); END IF;
  END IF;

  v_base := v_revenue - v_spend - v_taxes - v_rental - v_other;

  RETURN jsonb_build_object(
    'configured', true,
    'revenue', ROUND(v_revenue,2),
    'spend', ROUND(v_spend,2),
    'taxes', ROUND(v_taxes,2),
    'rental', ROUND(v_rental,2),
    'other_costs', ROUND(v_other,2),
    'base', ROUND(v_base,2),
    'pct', v_cfg.commission_pct,
    'valor_comissao', ROUND(GREATEST(v_base,0) * v_cfg.commission_pct / 100.0, 2),
    'base_formula', v_cfg.base_formula
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_commission_calc(UUID, DATE, DATE) FROM anon;