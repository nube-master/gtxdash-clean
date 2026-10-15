-- F2.A2: Mini-wave — backfill dos 37 NULLs residuais e re-tentar SET NOT NULL

DO $$
DECLARE
  v_gtx UUID := '0b758a2b-1b92-4769-b47b-416c567e320d'::uuid;
  v_tables TEXT[] := ARRAY['integration_logs','user_activity_logs','live_events'];
  v_table TEXT;
  v_affected BIGINT;
  v_before BIGINT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    v_before := _count_null_operation(v_table);

    IF v_before <= 0 THEN
      RAISE NOTICE '[SKIP] %: 0 NULLs — nada a fazer', v_table;
      CONTINUE;
    END IF;

    INSERT INTO _migration_log(phase, step, table_name, rows_before, status)
    VALUES ('F2.A2', 'residual_' || v_table, v_table, v_before, 'started');

    EXECUTE format(
      'UPDATE %I SET operation_id = $1 WHERE operation_id IS NULL',
      v_table
    ) USING v_gtx;

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    UPDATE _migration_log
       SET rows_affected = v_affected,
           rows_after    = _count_null_operation(v_table),
           status        = 'completed',
           completed_at  = NOW()
     WHERE phase = 'F2.A2' AND step = 'residual_' || v_table
       AND status = 'started';

    RAISE NOTICE 'Backfill residual % -> % linhas', v_table, v_affected;
  END LOOP;
END $$;

-- Retry SET NOT NULL
DO $$
DECLARE
  v_tables TEXT[] := ARRAY['integration_logs','user_activity_logs','live_events'];
  v_table TEXT;
  v_null_count BIGINT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    v_null_count := _count_null_operation(v_table);
    IF v_null_count > 0 THEN
      RAISE WARNING '[ALERTA] %: ainda tem % NULLs', v_table, v_null_count;
      INSERT INTO _migration_log(phase, step, table_name, rows_before, status, error_message)
      VALUES ('F2.A2', 'set_not_null_retry_' || v_table, v_table, v_null_count, 'blocked',
              'NULLs seguem aparecendo - investigar edge function ou trigger');
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ALTER COLUMN operation_id SET NOT NULL', v_table);

    INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
    VALUES ('F2.A2', 'set_not_null_retry_' || v_table, v_table, 'completed', NOW());

    RAISE NOTICE 'NOT NULL aplicado (retry) em %', v_table;
  END LOOP;
END $$;