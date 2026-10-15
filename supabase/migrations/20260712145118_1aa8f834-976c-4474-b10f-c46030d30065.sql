
-- F8.B.2.4 — resolve_meta_credential_by_account
CREATE OR REPLACE FUNCTION public.resolve_meta_credential_by_account(
  p_operation_id uuid,
  p_account_id text
) RETURNS TABLE(profile_key text, credential_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT oc.profile_key, oc.id
  FROM public.operation_credentials oc
  WHERE oc.operation_id = p_operation_id
    AND oc.provider = 'meta_ads'
    AND oc.status = 'active'
    AND p_account_id = ANY(oc.account_ids)
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT oc.profile_key, oc.id
  FROM public.operation_credentials oc
  WHERE oc.operation_id = p_operation_id
    AND oc.provider = 'meta_ads'
    AND oc.status = 'active'
    AND oc.profile_key = 'default'
    AND (oc.account_ids IS NULL OR array_length(oc.account_ids, 1) IS NULL)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_meta_credential_by_account(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_meta_credential_by_account(uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_meta_credential_by_account(uuid,text) TO service_role;

INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.2', 'create_resolve_meta_credential_helper', NULL,
        'completed', NOW(),
        jsonb_build_object('function', 'resolve_meta_credential_by_account(uuid,text)',
                          'replaces', 'HU_TOKEN_ACCOUNT_IDS hardcoded',
                          'lookup_pattern', 'account_specific OR default_fallback'));

-- F8.B.2.5 — View v_expiring_credentials
CREATE OR REPLACE VIEW public.v_expiring_credentials AS
SELECT
  oc.id,
  oc.operation_id,
  op.slug AS operation_slug,
  op.name AS operation_name,
  oc.provider,
  oc.profile_key,
  oc.vault_secret_name,
  oc.expires_at,
  oc.expires_at - NOW() AS time_until_expiry,
  oc.last_verified_at,
  oc.status,
  CASE
    WHEN oc.expires_at < NOW() THEN 'EXPIRED'
    WHEN oc.expires_at < NOW() + INTERVAL '7 days' THEN 'CRITICAL'
    WHEN oc.expires_at < NOW() + INTERVAL '30 days' THEN 'WARNING'
    ELSE 'OK'
  END AS urgency
FROM public.operation_credentials oc
JOIN public.operations op ON op.id = oc.operation_id
WHERE oc.status = 'active'
  AND oc.expires_at IS NOT NULL
  AND oc.expires_at < NOW() + INTERVAL '30 days'
ORDER BY oc.expires_at ASC;

REVOKE ALL ON public.v_expiring_credentials FROM PUBLIC;
REVOKE ALL ON public.v_expiring_credentials FROM authenticated, anon;
GRANT SELECT ON public.v_expiring_credentials TO service_role;

INSERT INTO public._migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.B.2', 'create_v_expiring_credentials', NULL,
        'completed', NOW(),
        jsonb_build_object('view', 'v_expiring_credentials',
                          'window', '30 days',
                          'urgency_levels', ARRAY['EXPIRED','CRITICAL','WARNING','OK']));
