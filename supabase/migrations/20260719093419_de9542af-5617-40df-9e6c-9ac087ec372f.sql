CREATE TABLE IF NOT EXISTS public.meta_permission_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('error_200','account_orphaned','mass_assignment_loss')),
  account_id TEXT,
  account_name TEXT,
  system_user_id TEXT,
  system_user_label TEXT,
  affected_count INTEGER DEFAULT 1,
  details JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','snoozed')),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_permission_alerts_open_uniq
  ON public.meta_permission_alerts (alert_type, COALESCE(account_id,''), COALESCE(system_user_id,''))
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS meta_permission_alerts_status_idx
  ON public.meta_permission_alerts (status, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_permission_alerts TO authenticated;
GRANT ALL ON public.meta_permission_alerts TO service_role;

ALTER TABLE public.meta_permission_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read meta_permission_alerts"
  ON public.meta_permission_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admins update meta_permission_alerts"
  ON public.meta_permission_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.tg_meta_permission_alerts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_meta_permission_alerts_updated_at ON public.meta_permission_alerts;
CREATE TRIGGER trg_meta_permission_alerts_updated_at
  BEFORE UPDATE ON public.meta_permission_alerts
  FOR EACH ROW EXECUTE FUNCTION public.tg_meta_permission_alerts_updated_at();