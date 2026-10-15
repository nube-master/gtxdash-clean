CREATE OR REPLACE FUNCTION public.traffic_hourly_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_recompute boolean := false;
  v_writer_brl boolean := false;
BEGIN
  v_currency := NULLIF(upper(COALESCE(NEW.currency, '')), '');
  IF v_currency IS NULL THEN
    v_currency := public.account_currency(NEW.account_id);
  END IF;
  v_currency := COALESCE(v_currency, 'BRL');
  NEW.currency := v_currency;

  -- writer mandou spend_brl explicitamente?
  v_writer_brl := NEW.spend_brl IS NOT NULL
                  AND (TG_OP = 'INSERT' OR NEW.spend_brl IS DISTINCT FROM OLD.spend_brl);

  IF NEW.fx_rate IS NULL OR NEW.fx_rate <= 0 THEN
    IF v_writer_brl AND COALESCE(NEW.spend, 0) > 0 THEN
      -- deriva a fx do próprio par enviado pelo writer (mantém consistência do guard rail)
      NEW.fx_rate := NEW.spend_brl / NEW.spend;
    ELSE
      NEW.fx_rate := COALESCE(public.fx_rate_for(v_currency, NEW.date), 1);
    END IF;
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

CREATE OR REPLACE FUNCTION public.traffic_data_fill_spend_brl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_recompute boolean := false;
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