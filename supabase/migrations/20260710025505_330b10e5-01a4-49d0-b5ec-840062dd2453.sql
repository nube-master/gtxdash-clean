-- F2.A: SET NOT NULL only on BASE TABLES (skip views), excluding notification_templates
DO $$
DECLARE
  v_table TEXT;
  v_null_count BIGINT;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'operation_id'
      AND c.is_nullable  = 'YES'
      AND t.table_type   = 'BASE TABLE'
      AND c.table_name  NOT LIKE 'backup_%'
      AND c.table_name  <> 'notification_templates'
  LOOP
    v_null_count := public._count_null_operation(v_table);
    IF v_null_count > 0 THEN
      RAISE WARNING '[SKIP F2.A] %: tem % NULLs', v_table, v_null_count;
      INSERT INTO public._migration_log(phase, step, table_name, rows_before, status, error_message)
      VALUES ('F2.A', 'set_not_null_' || v_table, v_table, v_null_count, 'skipped',
              'existem NULLs remanescentes — investigar');
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN operation_id SET NOT NULL', v_table);
    INSERT INTO public._migration_log(phase, step, table_name, status, completed_at)
    VALUES ('F2.A', 'set_not_null_' || v_table, v_table, 'completed', NOW());
  END LOOP;
END $$;

-- F2.B: Add nullable operation_id on 17 new tables
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'offers','offer_status_history',
    'spy_ads','spy_lps','spy_copywriters','spy_favorites',
    'pacing_rules','pacing_settings','pacing_cooldowns',
    'pacing_evaluation_log','pacing_budget_groups',
    'producers','user_page_permissions',
    'business_managers','campaign_mapping_rules',
    'notification_settings','notification_recipients'
  ];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.operations(id) ON DELETE RESTRICT',
      v_table
    );
    INSERT INTO public._migration_log(phase, step, table_name, status, completed_at)
    VALUES ('F2.B', 'add_column_' || v_table, v_table, 'completed', NOW());
  END LOOP;
END $$;

-- F2.C: notification_templates operation_id NULLABLE by design
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.operations(id) ON DELETE RESTRICT;

INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F2.C', 'add_column_notification_templates', 'notification_templates',
        'completed', NOW(),
        jsonb_build_object('nullable_by_design', true,
                          'reason', 'templates globais + custom por op'));
