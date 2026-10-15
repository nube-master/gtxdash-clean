-- 1) Triggers: recalcular spend_brl quando o spend muda no UPDATE
CREATE OR REPLACE FUNCTION public.traffic_data_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_last_date date;
  v_recompute boolean := false;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    NEW.fx_rate := public.fx_rate_for(v_currency, NEW.date);
  END IF;
  NEW.fx_rate := COALESCE(NEW.fx_rate, 1);

  IF NEW.spend_brl IS NULL THEN
    v_recompute := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.spend IS DISTINCT FROM OLD.spend
        AND NEW.spend_brl IS NOT DISTINCT FROM OLD.spend_brl THEN
    -- o writer não mandou spend_brl novo: valor antigo estava travado
    v_recompute := true;
  END IF;

  IF v_recompute THEN
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
  END IF;

  IF v_currency = 'BRL' THEN
    NEW.fx_stale := false;
  ELSE
    SELECT max(r.rate_date) INTO v_last_date
      FROM public.exchange_rates_daily r
     WHERE r.currency_from = v_currency AND r.currency_to = 'BRL';
    NEW.fx_stale := (v_last_date IS NULL OR v_last_date < NEW.date - 1);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.traffic_hourly_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_recompute boolean := false;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    NEW.fx_rate := COALESCE(public.fx_rate_for(v_currency, NEW.date), 1);
  END IF;

  IF NEW.spend_brl IS NULL THEN
    v_recompute := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.spend IS DISTINCT FROM OLD.spend
        AND NEW.spend_brl IS NOT DISTINCT FROM OLD.spend_brl THEN
    v_recompute := true;
  END IF;

  IF v_recompute THEN
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Backfill: últimos 4 dias, todas as operações, onde spend_brl divergiu de spend*fx
UPDATE public.traffic_data
   SET spend_brl = COALESCE(spend, 0) * COALESCE(NULLIF(fx_rate, 0), 1)
 WHERE date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 4
   AND abs(COALESCE(spend_brl, 0) - COALESCE(spend, 0) * COALESCE(NULLIF(fx_rate, 0), 1)) > 0.01;

UPDATE public.traffic_data_hourly
   SET spend_brl = COALESCE(spend, 0) * COALESCE(NULLIF(fx_rate, 0), 1)
 WHERE date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 4
   AND abs(COALESCE(spend_brl, 0) - COALESCE(spend, 0) * COALESCE(NULLIF(fx_rate, 0), 1)) > 0.01;
