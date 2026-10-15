-- 1. Restrict system_logs to admin-only read
DROP POLICY IF EXISTS "Authenticated users can read system_logs" ON public.system_logs;

CREATE POLICY "Admins can read system_logs"
  ON public.system_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));