
INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES
  ('F8.B.6', 'add_getAllMetaTokensForOperation', NULL, 'completed', NOW(),
   jsonb_build_object('helper','getAllMetaTokensForOperation',
     'fallback','getAllMetaAccessTokens on flag OFF or vault empty')),
  ('F8.B.6', 'canary_batch_2_list_meta_accounts', 'list-meta-accounts', 'completed', NOW(),
   jsonb_build_object('rollout_stage','canary_batch_2','risk_score',1,
     'pattern','no accountId, uses default')),
  ('F8.B.6', 'canary_batch_2_diag_meta_accounts', 'diag-meta-accounts', 'completed', NOW(),
   jsonb_build_object('rollout_stage','canary_batch_2','risk_score',1,
     'pattern','per-account resolution, tests perfil_hu lookup')),
  ('F8.B.6', 'canary_batch_2_sync_meta_balance', 'sync-meta-balance', 'completed', NOW(),
   jsonb_build_object('rollout_stage','canary_batch_2','risk_score',3,
     'pattern','cron write, per-account with legacy pool fallback'));
