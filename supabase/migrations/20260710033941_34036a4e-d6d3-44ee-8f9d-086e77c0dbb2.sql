-- F6.A: heavy tables
CREATE INDEX IF NOT EXISTS idx_integration_logs_op_created ON integration_logs (operation_id, created_at DESC);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
VALUES ('F6.A', 'idx_integration_logs_op_created', 'integration_logs', 'completed', NOW());

CREATE INDEX IF NOT EXISTS idx_redtrack_events_op_created ON redtrack_events (operation_id, created_at DESC);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
VALUES ('F6.A', 'idx_redtrack_events_op_created', 'redtrack_events', 'completed', NOW());

CREATE INDEX IF NOT EXISTS idx_traffic_data_op_created ON traffic_data (operation_id, created_at DESC);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
VALUES ('F6.A', 'idx_traffic_data_op_created', 'traffic_data', 'completed', NOW());

CREATE INDEX IF NOT EXISTS idx_pacing_hourly_op_created ON pacing_campaign_hourly_snapshots (operation_id, created_at DESC);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
VALUES ('F6.A', 'idx_pacing_hourly_op_created', 'pacing_campaign_hourly_snapshots', 'completed', NOW());

CREATE INDEX IF NOT EXISTS idx_live_events_op_created ON live_events (operation_id, created_at DESC);
INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F6.A', 'idx_live_events_op_created', 'live_events', 'completed', NOW(),
        jsonb_build_object('rows_indexed', 16175718, 'lock_type', 'ROW_EXCLUSIVE'));

-- F6.B: loop over remaining base tables
DO $$
DECLARE
  v_table TEXT;
  v_idx_name TEXT;
  v_created_at_exists BOOLEAN;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'operation_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT LIKE 'backup_%'
      AND c.table_name != 'operations'
      AND c.table_name NOT IN (
        'live_events','pacing_campaign_hourly_snapshots','traffic_data',
        'redtrack_events','integration_logs'
      )
  LOOP
    v_idx_name := 'idx_' || v_table || '_operation_id';

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_table AND column_name='created_at'
    ) INTO v_created_at_exists;

    BEGIN
      IF v_created_at_exists THEN
        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS %I ON %I (operation_id, created_at DESC)',
          v_idx_name, v_table
        );
      ELSE
        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS %I ON %I (operation_id)',
          v_idx_name, v_table
        );
      END IF;

      INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
      VALUES ('F6.B', 'idx_' || v_table, v_table, 'completed', NOW(),
              jsonb_build_object('composite_with_created_at', v_created_at_exists));

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _migration_log(phase, step, table_name, status, error_message)
      VALUES ('F6.B', 'idx_' || v_table, v_table, 'failed', SQLERRM);
    END;
  END LOOP;
END $$;