
-- ============================================
-- PART A — Wrapper RPC for vault.update_secret
-- ============================================
CREATE OR REPLACE FUNCTION public.vault_update_secret_wrapper(
  p_secret_id UUID,
  p_new_value TEXT,
  p_new_description TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  PERFORM vault.update_secret(
    p_secret_id,
    p_new_value,
    NULL,
    COALESCE(p_new_description, 'updated via wrapper at ' || NOW()::text)
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_update_secret_wrapper(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_update_secret_wrapper(uuid,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vault_update_secret_wrapper(uuid,text,text) TO service_role;

INSERT INTO _migration_log(phase, step, status, completed_at, metadata)
VALUES ('F8.B.5.1', 'create_vault_update_wrapper', 'completed', NOW(),
        jsonb_build_object('function','vault_update_secret_wrapper',
                          'purpose','sync Vault com app_settings'));

-- ============================================
-- PART B — Atomic sync (single DO block = implicit txn in migration)
-- ============================================
DO $sync$
DECLARE
  v_gtx UUID := '0b758a2b-1b92-4769-b47b-416c567e320d'::uuid;
  v_app_settings_token TEXT;
  v_app_settings_length INT;
  v_vault_secret_id UUID;
  v_current_env_length INT;
BEGIN
  SELECT value->>'token' INTO v_app_settings_token
  FROM app_settings WHERE key = 'meta_ads_access_token';

  IF v_app_settings_token IS NULL OR v_app_settings_token = '' THEN
    RAISE EXCEPTION 'app_settings.meta_ads_access_token vazio — não pode sincronizar';
  END IF;
  v_app_settings_length := LENGTH(v_app_settings_token);
  RAISE NOTICE 'app_settings token length: %', v_app_settings_length;

  SELECT vault_secret_id INTO v_vault_secret_id
  FROM operation_credentials
  WHERE operation_id = v_gtx AND provider = 'meta_ads' AND profile_key = 'default';

  IF v_vault_secret_id IS NULL THEN
    RAISE EXCEPTION 'operation_credentials default meta_ads não encontrada';
  END IF;

  SELECT LENGTH(decrypted_secret) INTO v_current_env_length
  FROM vault.decrypted_secrets WHERE id = v_vault_secret_id;

  RAISE NOTICE 'Vault secret_id: %, pre-sync length: %', v_vault_secret_id, v_current_env_length;

  PERFORM public.vault_update_secret_wrapper(
    v_vault_secret_id,
    v_app_settings_token,
    'Synced from app_settings on ' || NOW()::text ||
    ' — F8.B.5.1 (was env-var derived, now app_settings-derived)'
  );

  UPDATE operation_credentials
  SET metadata = metadata
    || jsonb_build_object(
        'primary_source', 'app_settings.meta_ads_access_token',
        'sync_history',
          COALESCE(metadata->'sync_history', '[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object(
            'synced_at', NOW()::text,
            'phase', 'F8.B.5.1',
            'from_length', v_current_env_length,
            'to_length', v_app_settings_length,
            'source_before', 'env_var:META_ADS_ACCESS_TOKEN',
            'source_after', 'app_settings.meta_ads_access_token'
          )),
        'legacy_env_var_note',
          'META_ADS_ACCESS_TOKEN env var mantida intacta como backup histórico. Length: '
          || v_current_env_length::text
      )
  WHERE operation_id = v_gtx AND provider = 'meta_ads' AND profile_key = 'default';

  INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
  VALUES ('F8.B.5.1', 'sync_vault_default_from_app_settings',
          'operation_credentials', 'completed', NOW(),
          jsonb_build_object(
            'operation_id', v_gtx,
            'provider', 'meta_ads',
            'profile_key', 'default',
            'app_settings_length', v_app_settings_length,
            'previous_vault_length', v_current_env_length,
            'sync_direction', 'app_settings → Vault',
            'production_impact', 'NONE — prod continua lendo de app_settings',
            'note', 'env var e app_settings ficam intactos. Vault agora espelha app_settings.'
          ));

  RAISE NOTICE 'F8.B.5.1 concluído.';
END
$sync$;
