
DROP VIEW IF EXISTS public.v_expiring_credentials CASCADE;

CREATE VIEW public.v_expiring_credentials
WITH (security_invoker = false) AS
SELECT
  oc.id,
  oc.operation_id,
  op.slug AS operation_slug,
  op.name AS operation_name,
  oc.provider,
  oc.profile_key,
  oc.vault_secret_name,
  oc.expires_at,
  (oc.expires_at - now()) AS time_until_expiry,
  oc.last_verified_at,
  oc.status,
  CASE
    WHEN oc.expires_at < now() THEN 'EXPIRED'
    WHEN oc.expires_at < (now() + interval '7 days') THEN 'CRITICAL'
    WHEN oc.expires_at < (now() + interval '30 days') THEN 'WARNING'
    ELSE 'OK'
  END AS urgency
FROM public.operation_credentials oc
JOIN public.operations op ON op.id = oc.operation_id
WHERE oc.status = 'active'
  AND oc.expires_at IS NOT NULL
  AND oc.expires_at < (now() + interval '30 days')
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.operation_members om
      WHERE om.user_id = auth.uid()
        AND om.operation_id = oc.operation_id
        AND om.status = 'active'
    )
  )
ORDER BY oc.expires_at;

REVOKE ALL ON public.v_expiring_credentials FROM PUBLIC, anon;
GRANT SELECT ON public.v_expiring_credentials TO authenticated;
GRANT SELECT ON public.v_expiring_credentials TO service_role;
