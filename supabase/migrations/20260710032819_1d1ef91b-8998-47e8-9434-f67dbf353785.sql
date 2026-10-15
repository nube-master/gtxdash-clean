DO $$
DECLARE
  v_table TEXT;
  v_fk_name TEXT;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.table_schema='public' AND c.column_name='operation_id'
      AND t.table_type='BASE TABLE'
      AND c.table_name NOT LIKE 'backup_%' AND c.table_name != 'operations'
    ORDER BY c.table_name
  LOOP
    v_fk_name := 'fk_' || v_table || '_operation';
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE RESTRICT NOT VALID',
        v_table, v_fk_name
      );
      INSERT INTO _migration_log(phase, step, table_name, status, completed_at)
      VALUES ('F5', 'add_fk_' || v_table, v_table, 'completed', NOW());
    EXCEPTION
      WHEN duplicate_object THEN
        INSERT INTO _migration_log(phase, step, table_name, status, error_message, completed_at)
        VALUES ('F5', 'add_fk_' || v_table, v_table, 'skipped', 'FK ja existe', NOW());
      WHEN OTHERS THEN
        INSERT INTO _migration_log(phase, step, table_name, status, error_message)
        VALUES ('F5', 'add_fk_' || v_table, v_table, 'failed', SQLERRM);
    END;
  END LOOP;
END $$;