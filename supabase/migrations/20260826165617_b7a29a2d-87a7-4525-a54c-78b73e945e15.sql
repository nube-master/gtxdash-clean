CREATE TABLE public.audit_log_access_denied (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attempted_route text NOT NULL,
  granted_routes text[] NOT NULL DEFAULT '{}',
  operation_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_log_access_denied TO authenticated;
GRANT ALL ON public.audit_log_access_denied TO service_role;

ALTER TABLE public.audit_log_access_denied ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own denied access logs"
  ON public.audit_log_access_denied FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own denied access logs"
  ON public.audit_log_access_denied FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins read all denied access logs"
  ON public.audit_log_access_denied FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_audit_access_denied_user_created
  ON public.audit_log_access_denied (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_suspicious_access_denied(_days int DEFAULT 7, _min_attempts int DEFAULT 5)
RETURNS TABLE (user_id uuid, attempts bigint, attempted_routes text[], last_attempt timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.user_id,
         COUNT(*) AS attempts,
         ARRAY_AGG(DISTINCT a.attempted_route) AS attempted_routes,
         MAX(a.created_at) AS last_attempt
    FROM public.audit_log_access_denied a
   WHERE public.has_role(auth.uid(), 'admin')
     AND a.created_at > now() - make_interval(days => _days)
   GROUP BY a.user_id
  HAVING COUNT(*) >= _min_attempts
   ORDER BY 2 DESC
$$;

REVOKE EXECUTE ON FUNCTION public.get_suspicious_access_denied(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_suspicious_access_denied(int, int) TO authenticated;