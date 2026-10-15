
-- =============================================
-- STEP 1: Create operations table
-- =============================================
CREATE TABLE IF NOT EXISTS public.operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  plan text NOT NULL DEFAULT 'enterprise',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read operations" ON public.operations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage operations" ON public.operations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- STEP 6: Create operation_members table
-- =============================================
CREATE TABLE IF NOT EXISTS public.operation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  UNIQUE(operation_id, user_id)
);

ALTER TABLE public.operation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read operation_members" ON public.operation_members
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage operation_members" ON public.operation_members
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- STEP 8: Create super_admins table
-- =============================================
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read super_admins" ON public.super_admins
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can manage super_admins" ON public.super_admins
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- STEP 4: Add operation_id column to ALL data tables (nullable)
-- =============================================
ALTER TABLE public.traffic_data ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.traffic_data_hourly ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.traffic_breakdowns ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.sales_data ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.redtrack_events ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.clickbank_audit ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.meta_ad_accounts ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.meta_campaign_status ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.meta_account_financials ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.meta_spend_realtime_safe ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.daily_totals_snapshot ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.exchange_rate_log ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.integration_logs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.system_logs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.system_health_logs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.system_daily_snapshot ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.gtx_decisions_log ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.gtx_data_warnings ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.automated_reports_log ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.fixed_costs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.manual_adjustments ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.monthly_goals ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.planning_goals ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.cashflow_settings ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.cashflow_adjustments ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.campaign_mapping_rules ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.business_managers ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.account_utm_aliases ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.payment_models ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.scale_radar_plans ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.notification_recipients ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.recipient_notification_prefs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_courses ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_modules ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_lessons ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_lesson_progress ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_lesson_attachments ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_comments ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_knowledge ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.academy_playbooks ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.jarvis_conversations ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.jarvis_messages ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
ALTER TABLE public.user_activity_logs ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES public.operations(id);
