CREATE OR REPLACE FUNCTION public.traffic_hourly_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_writer_brl boolean := false;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  v_writer_brl := NEW.spend_brl IS NOT NULL
                  AND (TG_OP = 'INSERT' OR NEW.spend_brl IS DISTINCT FROM OLD.spend_brl);

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    IF v_writer_brl AND COALESCE(NEW.spend, 0) > 0 THEN
      NEW.fx_rate := NEW.spend_brl / NEW.spend;
    ELSE
      NEW.fx_rate := COALESCE(public.fx_rate_for(v_currency, NEW.date), 1);
    END IF;
  END IF;

  -- Writer não mandou BRL => o BRL é sempre derivado (evita valores congelados/inconsistentes)
  IF NOT v_writer_brl THEN
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.traffic_data_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_writer_brl boolean := false;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  v_writer_brl := NEW.spend_brl IS NOT NULL
                  AND (TG_OP = 'INSERT' OR NEW.spend_brl IS DISTINCT FROM OLD.spend_brl);

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    IF v_writer_brl AND COALESCE(NEW.spend, 0) > 0 THEN
      NEW.fx_rate := NEW.spend_brl / NEW.spend;
    ELSE
      NEW.fx_rate := COALESCE(public.fx_rate_for(v_currency, NEW.date), 1);
    END IF;
  END IF;

  IF NOT v_writer_brl THEN
    NEW.spend_brl := COALESCE(NEW.spend, 0) * NEW.fx_rate;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recalcula linhas legadas inconsistentes (>2%) dos últimos 10 dias
UPDATE public.traffic_data_hourly
SET spend_brl = spend * fx_rate
WHERE date >= (CURRENT_DATE - 10)
  AND spend > 1 AND COALESCE(fx_rate,0) > 0
  AND (spend_brl / (spend * fx_rate)) NOT BETWEEN 0.98 AND 1.02;

UPDATE public.traffic_data
SET spend_brl = spend * fx_rate
WHERE date >= (CURRENT_DATE - 10)
  AND spend > 1 AND COALESCE(fx_rate,0) > 0
  AND (spend_brl / (spend * fx_rate)) NOT BETWEEN 0.98 AND 1.02;