ALTER TABLE public.traffic_data
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS spend_brl numeric,
  ADD COLUMN IF NOT EXISTS fx_stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_traffic_data_spend_brl_null ON public.traffic_data (date) WHERE spend_brl IS NULL;

-- Retorna a taxa de conversao para BRL vigente na data (carry-forward)
CREATE OR REPLACE FUNCTION public.fx_rate_for(_currency text, _date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _currency IS NULL OR upper(_currency) IN ('BRL','') THEN 1::numeric
    ELSE COALESCE(
      (SELECT r.rate_avg
         FROM public.exchange_rates_daily r
        WHERE r.currency_from = upper(_currency)
          AND r.currency_to = 'BRL'
          AND r.rate_date <= _date
          AND r.rate_avg > 0
        ORDER BY r.rate_date DESC, r.fetched_at DESC NULLS LAST
        LIMIT 1),
      (SELECT r.rate_avg
         FROM public.exchange_rates_daily r
        WHERE r.currency_from = upper(_currency)
          AND r.currency_to = 'BRL'
          AND r.rate_avg > 0
        ORDER BY r.rate_date ASC
        LIMIT 1),
      (SELECT c.rate
         FROM public.exchange_rates_cache c
        WHERE c.base_currency = upper(_currency)
          AND c.target_currency = 'BRL'
        LIMIT 1)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.fx_to_brl(_amount numeric, _currency text, _date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(_amount, 0) * COALESCE(public.fx_rate_for(_currency, _date), 1);
$$;

-- Trigger de seguranca: preenche moeda/taxa/spend_brl quando o writer nao mandar
CREATE OR REPLACE FUNCTION public.traffic_data_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
  v_rate numeric;
  v_last_date date;
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

DROP TRIGGER IF EXISTS trg_traffic_data_fill_spend_brl ON public.traffic_data;
CREATE TRIGGER trg_traffic_data_fill_spend_brl
BEFORE INSERT OR UPDATE ON public.traffic_data
FOR EACH ROW EXECUTE FUNCTION public.traffic_data_fill_spend_brl();

-- Health check de FX
CREATE OR REPLACE FUNCTION public.get_fx_health()
RETURNS TABLE(currency_from text, last_rate_date date, rate_avg numeric, hours_stale numeric, is_stale boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (r.currency_from)
           r.currency_from, r.rate_date, r.rate_avg, r.fetched_at
      FROM public.exchange_rates_daily r
     WHERE r.currency_to = 'BRL'
     ORDER BY r.currency_from, r.rate_date DESC, r.fetched_at DESC NULLS LAST
  )
  SELECT l.currency_from,
         l.rate_date,
         l.rate_avg,
         ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(l.fetched_at, l.rate_date::timestamptz))) / 3600.0, 1) AS hours_stale,
         (COALESCE(l.fetched_at, l.rate_date::timestamptz) < now() - interval '24 hours') AS is_stale
    FROM latest l;
$$;

GRANT EXECUTE ON FUNCTION public.fx_rate_for(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_to_brl(numeric, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fx_health() TO authenticated, service_role;