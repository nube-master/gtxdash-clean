CREATE OR REPLACE FUNCTION public.account_currency(_account_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(a.currency)
    FROM public.meta_ad_accounts a
   WHERE regexp_replace(a.account_id, '^(act_)+', '') = regexp_replace(COALESCE(_account_id,''), '^(act_)+', '')
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.traffic_data_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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
    v_currency := public.account_currency(NEW.account_id);
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

REVOKE EXECUTE ON FUNCTION public.account_currency(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fx_rate_for(text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fx_to_brl(numeric, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_fx_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_currency(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_rate_for(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_to_brl(numeric, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fx_health() TO authenticated, service_role;