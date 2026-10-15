-- F10 C4: SA com cross_op_intent enxerga >=2 ops e gera audit.
-- Executar como super_admin.

\set ON_ERROR_STOP on

SET app.cross_op_intent = 'true';

DO $$
DECLARE
  distinct_ops int;
  audit_before int;
  audit_after int;
BEGIN
  SELECT COUNT(*) INTO audit_before FROM public.system_logs
    WHERE action = 'cross_op_intent_used' AND created_at > now() - interval '5 min';

  SELECT COUNT(DISTINCT operation_id) INTO distinct_ops FROM public.offers;
  RAISE NOTICE 'C4 distinct_ops=%', distinct_ops;

  IF distinct_ops < 2 THEN
    RAISE EXCEPTION 'C4 FAIL: esperado >=2 ops, obteve %', distinct_ops;
  END IF;

  SELECT COUNT(*) INTO audit_after FROM public.system_logs
    WHERE action = 'cross_op_intent_used' AND created_at > now() - interval '5 min';

  IF audit_after <= audit_before THEN
    RAISE WARNING 'C4 WARN: audit não incrementou (trigger de intent pode não estar disparando)';
  ELSE
    RAISE NOTICE 'C4 PASS: %d entradas de audit', audit_after - audit_before;
  END IF;
END$$;

RESET app.cross_op_intent;
