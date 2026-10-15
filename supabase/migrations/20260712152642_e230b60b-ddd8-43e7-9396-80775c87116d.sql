UPDATE public.feature_flags
SET enabled = true,
    operation_ids = ARRAY['0b758a2b-1b92-4769-b47b-416c567e320d'::uuid],
    updated_at = NOW()
WHERE key = 'operation_credentials_vault';

INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.5', 'enable_flag_for_gtx', 'feature_flags',
        'completed', NOW(),
        jsonb_build_object('flag', 'operation_credentials_vault',
                          'operation_ids', ARRAY['0b758a2b-1b92-4769-b47b-416c567e320d']));