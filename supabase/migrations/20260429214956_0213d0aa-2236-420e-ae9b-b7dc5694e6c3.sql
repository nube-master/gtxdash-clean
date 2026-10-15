CREATE OR REPLACE FUNCTION public.fix_redtrack_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  pd_val numeric;
BEGIN
  IF NEW.raw_payload IS NOT NULL AND NEW.raw_payload->>'payout_default' IS NOT NULL THEN
    pd_val := (NEW.raw_payload->>'payout_default')::numeric;
    IF pd_val > 0 AND pd_val <> NEW.amount THEN
      NEW.amount := pd_val;
    END IF;
  END IF;
  IF NEW.event_type = 'purchase' AND NEW.amount > 300 THEN
    NEW.amount := 235;
  END IF;
  RETURN NEW;
END;
$function$;