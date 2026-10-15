-- ============================================
-- GTX SPY — Sprint 1 (Radar)
-- ============================================

CREATE TABLE public.spy_project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  name text NOT NULL,
  niche text,
  country text DEFAULT 'US',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.spy_advertiser (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  project_id uuid REFERENCES public.spy_project(id) ON DELETE CASCADE,
  name text NOT NULL,
  library_url text NOT NULL,
  funnel_url text,
  country text DEFAULT 'US',
  funnel_type text,
  niche text,
  status text NOT NULL DEFAULT 'active',
  current_ads_count int NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.spy_advertiser_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  advertiser_id uuid NOT NULL REFERENCES public.spy_advertiser(id) ON DELETE CASCADE,
  date date NOT NULL,
  active_ads_count int NOT NULL,
  source text NOT NULL DEFAULT 'daily_cron',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (advertiser_id, date)
);

CREATE TABLE public.spy_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  advertiser_id uuid NOT NULL REFERENCES public.spy_advertiser(id) ON DELETE CASCADE,
  type text NOT NULL,
  trigger_value int,
  message text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX idx_spy_project_operation ON public.spy_project(operation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_spy_advertiser_operation ON public.spy_advertiser(operation_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_spy_advertiser_project ON public.spy_advertiser(project_id);
CREATE INDEX idx_spy_advertiser_status ON public.spy_advertiser(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_spy_history_advertiser_date ON public.spy_advertiser_history(advertiser_id, date DESC);
CREATE INDEX idx_spy_history_operation ON public.spy_advertiser_history(operation_id, date DESC);
CREATE INDEX idx_spy_alert_unread ON public.spy_alert(operation_id, triggered_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_spy_alert_advertiser ON public.spy_alert(advertiser_id, triggered_at DESC);

CREATE TRIGGER trg_spy_project_updated
  BEFORE UPDATE ON public.spy_project
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_spy_advertiser_updated
  BEFORE UPDATE ON public.spy_advertiser
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: user é membro ativo da operação? (security definer)
CREATE OR REPLACE FUNCTION public.spy_user_in_operation(_user_id uuid, _operation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members om
      WHERE om.user_id = _user_id
        AND om.operation_id = _operation_id
        AND COALESCE(om.status, 'active') = 'active'
    );
$$;

ALTER TABLE public.spy_project ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_advertiser ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_advertiser_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_alert ENABLE ROW LEVEL SECURITY;

-- spy_project policies
CREATE POLICY "spy_project_select" ON public.spy_project
  FOR SELECT TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_project_insert" ON public.spy_project
  FOR INSERT TO authenticated
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_project_update" ON public.spy_project
  FOR UPDATE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_project_delete" ON public.spy_project
  FOR DELETE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

-- spy_advertiser policies
CREATE POLICY "spy_advertiser_select" ON public.spy_advertiser
  FOR SELECT TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_advertiser_insert" ON public.spy_advertiser
  FOR INSERT TO authenticated
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_advertiser_update" ON public.spy_advertiser
  FOR UPDATE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_advertiser_delete" ON public.spy_advertiser
  FOR DELETE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

-- spy_advertiser_history policies
CREATE POLICY "spy_history_select" ON public.spy_advertiser_history
  FOR SELECT TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_history_insert" ON public.spy_advertiser_history
  FOR INSERT TO authenticated
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));

-- spy_alert policies
CREATE POLICY "spy_alert_select" ON public.spy_alert
  FOR SELECT TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_alert_insert" ON public.spy_alert
  FOR INSERT TO authenticated
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_alert_update" ON public.spy_alert
  FOR UPDATE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));