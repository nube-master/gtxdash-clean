DO $$
DECLARE
  v_gtx UUID := '0b758a2b-1b92-4769-b47b-416c567e320d'::uuid;
  v_tables TEXT[] := ARRAY[
    'offers','offer_status_history',
    'spy_ads','spy_lps','spy_copywriters','spy_favorites',
    'pacing_rules','pacing_settings','pacing_cooldowns',
    'pacing_evaluation_log','pacing_budget_groups',
    'producers','user_page_permissions',
    'live_viewers_active','live_viewers_geo'
  ];
  v_table TEXT;
  v_before BIGINT;
  v_affected BIGINT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      v_before := _count_null_operation(v_table);

      IF v_before = -1 THEN
        INSERT INTO _migration_log(phase, step, table_name, status, error_message)
        VALUES ('F3', 'backfill_' || v_table, v_table, 'skipped',
                'coluna operation_id nao existe - pode ser view');
        CONTINUE;
      END IF;

      IF v_before = 0 THEN
        INSERT INTO _migration_log(phase, step, table_name, status, error_message)
        VALUES ('F3', 'backfill_' || v_table, v_table, 'skipped', 'ja tem 0 NULLs');
        CONTINUE;
      END IF;

      INSERT INTO _migration_log(phase, step, table_name, rows_before, status)
      VALUES ('F3', 'backfill_' || v_table, v_table, v_before, 'started');

      EXECUTE format('UPDATE %I SET operation_id = $1 WHERE operation_id IS NULL', v_table)
      USING v_gtx;

      GET DIAGNOSTICS v_affected = ROW_COUNT;

      UPDATE _migration_log
         SET rows_affected = v_affected,
             rows_after    = _count_null_operation(v_table),
             status        = 'completed',
             completed_at  = NOW()
       WHERE phase = 'F3' AND step = 'backfill_' || v_table AND status = 'started';
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _migration_log(phase, step, table_name, status, error_message)
      VALUES ('F3', 'backfill_' || v_table, v_table, 'failed', SQLERRM);
    END;
  END LOOP;
END $$;