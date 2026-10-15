CREATE OR REPLACE FUNCTION public.vault_create_secret_wrapper(
  secret_value TEXT,
  secret_name TEXT,
  secret_description TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
  v_existing UUID;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = secret_name;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_secret_id := vault.create_secret(
    secret_value,
    secret_name,
    COALESCE(secret_description, 'created via wrapper')
  );
  RETURN v_secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_create_secret_wrapper(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_create_secret_wrapper(text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_secret_wrapper(text,text,text) TO service_role;

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.4', 'create_vault_wrapper', NULL,
        'completed', NOW(),
        jsonb_build_object('function','vault_create_secret_wrapper',
                          'idempotent',true,'grant','service_role_only'));