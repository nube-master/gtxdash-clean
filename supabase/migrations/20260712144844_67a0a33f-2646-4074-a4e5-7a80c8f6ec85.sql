
-- F8.B.2.1 — pgsodium (dependência do Vault)
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- F8.B.2.2 — Tabela operation_credentials
CREATE TABLE public.operation_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,

  provider text NOT NULL CHECK (provider IN (
    'meta_ads','redtrack','clickbank','vturb','apify',
    'newsbreak','pushcut','todoist','custom'
  )),

  profile_key text NOT NULL DEFAULT 'default',

  vault_secret_id uuid REFERENCES vault.secrets(id),
  vault_secret_name text NOT NULL,

  account_ids text[] NOT NULL DEFAULT ARRAY[]::text[],

  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','expired','revoked','testing','pending_verification'
  )),
  expires_at timestamptz,
  rotated_at timestamptz,
  last_verified_at timestamptz,
  last_verification_error text,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE(operation_id, provider, profile_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_credentials TO authenticated;
GRANT ALL ON public.operation_credentials TO service_role;

ALTER TABLE public.operation_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "op_creds_super_admin_only" ON public.operation_credentials
FOR ALL
USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

CREATE INDEX idx_op_creds_operation_status
  ON public.operation_credentials(operation_id, status);
CREATE INDEX idx_op_creds_provider
  ON public.operation_credentials(provider, status);
CREATE INDEX idx_op_creds_account_ids
  ON public.operation_credentials USING GIN(account_ids);
CREATE INDEX idx_op_creds_expiring
  ON public.operation_credentials(expires_at)
  WHERE status='active' AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public._operation_credentials_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_operation_credentials_touch
  BEFORE UPDATE ON public.operation_credentials
  FOR EACH ROW EXECUTE FUNCTION public._operation_credentials_touch();

INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.2', 'create_operation_credentials_table', 'operation_credentials',
        'completed', NOW(),
        jsonb_build_object('has_rls', true, 'indexes', 4,
                          'unique_key', '(operation_id, provider, profile_key)'));

-- F8.B.2.3 — Helper get_operation_credential
CREATE OR REPLACE FUNCTION public.get_operation_credential(
  p_operation_id uuid,
  p_provider text,
  p_profile_key text DEFAULT 'default'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_secret_value text;
  v_status text;
BEGIN
  SELECT vault_secret_id, status
    INTO v_secret_id, v_status
  FROM public.operation_credentials
  WHERE operation_id = p_operation_id
    AND provider = p_provider
    AND profile_key = p_profile_key;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Credential não encontrada: op=% provider=% profile=%',
      p_operation_id, p_provider, p_profile_key
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Credential com status %: op=% provider=% profile=%',
      v_status, p_operation_id, p_provider, p_profile_key
      USING ERRCODE = 'invalid_grant';
  END IF;

  SELECT decrypted_secret INTO v_secret_value
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_secret_value IS NULL THEN
    RAISE EXCEPTION 'Vault secret vazio pra op=% provider=% profile=%',
      p_operation_id, p_provider, p_profile_key;
  END IF;

  UPDATE public.operation_credentials
  SET last_verified_at = NOW()
  WHERE operation_id = p_operation_id
    AND provider = p_provider
    AND profile_key = p_profile_key;

  RETURN v_secret_value;
END;
$$;

REVOKE ALL ON FUNCTION public.get_operation_credential(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_operation_credential(uuid,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_operation_credential(uuid,text,text) TO service_role;

INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.2', 'create_get_credential_helper', NULL,
        'completed', NOW(),
        jsonb_build_object('function', 'get_operation_credential(uuid,text,text)',
                          'security_definer', true,
                          'grant', 'service_role_only'));
