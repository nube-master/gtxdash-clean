DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'offers','offer_status_history',
    'spy_ads','spy_lps','spy_copywriters','spy_favorites',
    'pacing_rules','pacing_settings','pacing_cooldowns',
    'pacing_evaluation_log','pacing_budget_groups',
    'producers','user_page_permissions'
  ];
  v_table TEXT;
  v_null_count BIGINT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    v_null_count := _count_null_operation(v_table);

    IF v_null_count > 0 THEN
      INSERT INTO _migration_log(phase, step, table_name, rows_before, status, error_message)
      VALUES ('F4', 'set_not_null_' || v_table, v_table, v_null_count, 'skipped',
              'NULLs remanescentes - investigar');
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ALTER COLUMN operation_id SET NOT NULL', v_table);

    INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
    VALUES ('F4', 'set_not_null_' || v_table, v_table, 'completed', NOW());
  END LOOP;
END $$;