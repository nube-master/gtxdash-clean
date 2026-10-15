SET LOCAL statement_timeout = '30min';
SET LOCAL lock_timeout = '5min';
ALTER TABLE public.live_events VALIDATE CONSTRAINT fk_live_events_operation;
INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.A', 'validate_fk_live_events', 'live_events','completed', NOW(),
        jsonb_build_object('method','SET LOCAL statement_timeout=30min',
                          'was_pending_since','F5'));