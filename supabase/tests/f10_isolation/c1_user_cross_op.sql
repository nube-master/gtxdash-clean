-- F10 C1: user comum não vê rows de outra operação
-- Executar como copyperes (viewer GTX). Substituir :other_op pelo UUID de ESCALIFY.

\set ON_ERROR_STOP on

DO $$
DECLARE
  tables text[] := ARRAY[
    'meta_payment_transactions',
    'payoneer_transactions',
    'offers',
    'spy_offers',
    'sales_data',
    'redtrack_events',
    'traffic_data',
    'meta_campaign_status',
    'planning_goals',
    'monthly_goals',
    'pacing_rules',
    'media_channels'
  ];
  t text;
  cnt bigint;
  leaks int := 0;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE operation_id = %L', t, :'other_op')
      INTO cnt;
    RAISE NOTICE 'table=% leaked_rows=%', t, cnt;
    IF cnt > 0 THEN leaks := leaks + 1; END IF;
  END LOOP;

  IF leaks > 0 THEN
    RAISE EXCEPTION 'C1 FAIL: % tabelas vazaram cross-op', leaks;
  ELSE
    RAISE NOTICE 'C1 PASS: 0 leaks em % tabelas', array_length(tables, 1);
  END IF;
END$$;
