ALTER TABLE public.traffic_data_hourly
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS spend_brl numeric;

CREATE OR REPLACE FUNCTION public.traffic_hourly_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    SELECT upper(a.currency) INTO v_currency
      FROM public.meta_ad_accounts a
     WHERE a.account_id = NEW.account_id
     LIMIT 1;
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    NEW.fx_rate := COALESCE(public.fx_rate_for(v_currency, NEW.date), 1);
  END IF;

  IF NEW.spend_brl IS NULL THEN
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_traffic_hourly_fill_spend_brl ON public.traffic_data_hourly;
CREATE TRIGGER trg_traffic_hourly_fill_spend_brl
BEFORE INSERT OR UPDATE ON public.traffic_data_hourly
FOR EACH ROW EXECUTE FUNCTION public.traffic_hourly_fill_spend_brl();