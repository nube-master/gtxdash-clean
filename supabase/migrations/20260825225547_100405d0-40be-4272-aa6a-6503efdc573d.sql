ALTER TABLE public.traffic_breakdowns
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS spend_brl numeric,
  ADD COLUMN IF NOT EXISTS fx_stale boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.traffic_breakdowns_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_last_date date;
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

DROP TRIGGER IF EXISTS trg_traffic_breakdowns_fill_spend_brl ON public.traffic_breakdowns;
CREATE TRIGGER trg_traffic_breakdowns_fill_spend_brl
BEFORE INSERT OR UPDATE ON public.traffic_breakdowns
FOR EACH ROW EXECUTE FUNCTION public.traffic_breakdowns_fill_spend_brl();