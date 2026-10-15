INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES
  ('F8.B.6', 'canary_batch_5_validate_meta_tokens', 'validate-meta-tokens',
   'completed', NOW(),
   jsonb_build_object('rollout_stage','canary_batch_5','risk_score',2,
                      'purpose','test all tokens vs all accounts',
                      'strategy','vault_first_with_legacy_fallback')),
  ('F8.B.6', 'canary_batch_5_diag_meta_tokens', 'diag-meta-tokens',
   'completed', NOW(),
   jsonb_build_object('rollout_stage','canary_batch_5','risk_score',1,
                      'purpose','manual diagnostic',
                      'strategy','vault_first_scoped_by_account_id_optional'));