
-- Activity logs table
CREATE TABLE public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_user_activity_logs_created ON public.user_activity_logs (created_at DESC);
CREATE INDEX idx_user_activity_logs_user ON public.user_activity_logs (user_id);
CREATE INDEX idx_user_activity_logs_action ON public.user_activity_logs (action);

-- RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can read activity_logs"
  ON public.user_activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role inserts (from edge functions)
CREATE POLICY "Service can insert activity_logs"
  ON public.user_activity_logs FOR INSERT
  TO public
  WITH CHECK (true);
