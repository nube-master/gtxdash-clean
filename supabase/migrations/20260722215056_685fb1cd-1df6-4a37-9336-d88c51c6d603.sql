DO $mig$
DECLARE
  fn text;
  new_body text;
BEGIN
  FOR fn IN
    SELECT 'public.get_live_pacing_campaigns(uuid)'
    UNION ALL SELECT 'public.get_offers_sales_intelligence(date,date,uuid)'
  LOOP
    -- Recupera definição atual e injeta #variable_conflict use_column logo após BEGIN.
    SELECT pg_get_functiondef(fn::regprocedure) INTO new_body;
    -- Só injeta se ainda não tiver o pragma
    IF new_body NOT LIKE '%#variable_conflict use_column%' THEN
      new_body := regexp_replace(
        new_body,
        E'AS \\$function\\$\\s*\nBEGIN',
        E'AS $function$\n#variable_conflict use_column\nBEGIN',
        'n'
      );
      EXECUTE new_body;
    END IF;
  END LOOP;
END
$mig$;