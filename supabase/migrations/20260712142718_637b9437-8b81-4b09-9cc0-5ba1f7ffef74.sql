-- Backfill (única operação GTX)
UPDATE public.pacing_evaluation_log 
SET operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'::uuid 
WHERE operation_id IS NULL;

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.A', 'backfill_residual_pacing_evaluation_log',
  'pacing_evaluation_log', 'completed', NOW(),
  jsonb_build_object('reason','residuais depois do deploy do fix',
                    'operation_id','0b758a2b-1b92-4769-b47b-416c567e320d'));

-- NOT NULL
ALTER TABLE public.pacing_evaluation_log 
ALTER COLUMN operation_id SET NOT NULL;

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.A', 'set_not_null_pacing_evaluation_log',
  'pacing_evaluation_log', 'completed', NOW(),
  jsonb_build_object('was_pending_since','F4'));