INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.6', 'canary_batch_4_2_pacing_toggle_campaign',
        'pacing-toggle-campaign',
        'completed', NOW(),
        jsonb_build_object('rollout_stage','canary_batch_4_2',
                          'risk_score',5,
                          'trigger','on-demand UI',
                          'critical_action','toggle_active_paused',
                          'blast_radius','1_click_per_call',
                          'strategy','ONE_at_a_time'));