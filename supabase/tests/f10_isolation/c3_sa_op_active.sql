-- F10 C3: SA com op ativa (GTX) vê apenas rows GTX.
-- Executar como gabrielvidal156 com session-var app.current_operation_id = GTX_UUID.

\set ON_ERROR_STOP on

DO $$
DECLARE
  tables text[] := ARRAY[
    'meta_payment_transactions','payoneer_transactions','offers','spy_offers',
    'sales_data','redtrack_events','traffic_data','meta_campaign_status',
    'planning_goals','monthly_goals','pacing_rules','media_channels'
  ];
  t text;
  distinct_ops int;
  leaks int := 0;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'SELECT COUNT(DISTINCT operation_id) FROM public.%I WHERE operation_id IS NOT NULL LIMIT 1000',
      t
    ) INTO distinct_ops;
    RAISE NOTICE 'table=% distinct_ops=%', t, distinct_ops;
    IF distinct_ops > 1 THEN leaks := leaks + 1; END IF;
  END LOOP;

  IF leaks > 0 THEN
    RAISE EXCEPTION 'C3 FAIL: % tabelas retornaram > 1 op', leaks;
  ELSE
    RAISE NOTICE 'C3 PASS: todas tabelas escopadas em 1 op';
  END IF;
END$$;
