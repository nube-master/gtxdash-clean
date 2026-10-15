INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.6', 'canary_batch_4_3_pacing_update_campaign',
        'pacing-update-campaign',
        'completed', NOW(),
        jsonb_build_object('rollout_stage','canary_batch_4_3',
                           'risk_score',5,
                           'trigger','on-demand UI',
                           'critical_action','budget_update',
                           'blast_radius','1_call_per_click',
                           'strategy','C.3_paralelo_com_toggle'));