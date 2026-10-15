INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES (
  'F8.B.6',
  'canary_batch_4_1_pacing_controller',
  'pacing-controller',
  'completed',
  NOW(),
  jsonb_build_object(
    'rollout_stage', 'canary_batch_4_1',
    'risk_score', 5,
    'cron', '5min',
    'critical_actions', ARRAY['pause','budget_update'],
    'monitoring_window', '24h',
    'strategy', 'ONE_at_a_time'
  )
);