
-- =================== 1. BUDGET GROUPS ===================
CREATE TABLE public.pacing_budget_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  max_spend_per_hour numeric(12,2) NOT NULL,
  max_daily_total numeric(12,2),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency IN ('USD','BRL','EUR','HUF')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_budget_groups TO authenticated;
GRANT ALL ON public.pacing_budget_groups TO service_role;
ALTER TABLE public.pacing_budget_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.pacing_budget_groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =================== 2. RULES ===================
CREATE TABLE public.pacing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  budget_group_id uuid REFERENCES public.pacing_budget_groups(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT true,
  dry_run boolean NOT NULL DEFAULT true,
  filter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_triggered_at timestamptz,
  fire_count_today int NOT NULL DEFAULT 0,
  fire_count_total int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_rules TO authenticated;
GRANT ALL ON public.pacing_rules TO service_role;
ALTER TABLE public.pacing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.pacing_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =================== 3. ACTION LOG ===================
CREATE TABLE public.pacing_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.pacing_rules(id) ON DELETE SET NULL,
  budget_group_id uuid REFERENCES public.pacing_budget_groups(id) ON DELETE SET NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  account_id text NOT NULL,
  account_name text,
  action_type text NOT NULL CHECK (action_type IN ('pause','resume','alert','reduce_budget','snooze')),
  reason text NOT NULL,
  spend_at_action numeric(12,2),
  spend_expected numeric(12,2),
  spend_last_hour numeric(12,2),
  daily_budget numeric(12,2),
  sales_last_hour int,
  pct_above_expected numeric(6,2),
  dry_run boolean NOT NULL DEFAULT false,
  success boolean,
  meta_response jsonb,
  error_message text,
  pushcut_sent boolean NOT NULL DEFAULT false,
  pushcut_response jsonb,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pacing_action_log_triggered_at ON public.pacing_action_log (triggered_at DESC);
CREATE INDEX idx_pacing_action_log_rule ON public.pacing_action_log (rule_id);
CREATE INDEX idx_pacing_action_log_campaign ON public.pacing_action_log (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_action_log TO authenticated;
GRANT ALL ON public.pacing_action_log TO service_role;
ALTER TABLE public.pacing_action_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.pacing_action_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =================== 4. COOLDOWNS ===================
CREATE TABLE public.pacing_cooldowns (
  campaign_id text PRIMARY KEY,
  rule_id uuid REFERENCES public.pacing_rules(id) ON DELETE CASCADE,
  snoozed_until timestamptz NOT NULL,
  reason text,
  set_by text CHECK (set_by IN ('daemon','manual','smart_reenable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_cooldowns TO authenticated;
GRANT ALL ON public.pacing_cooldowns TO service_role;
ALTER TABLE public.pacing_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.pacing_cooldowns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =================== 5. SETTINGS ===================
CREATE TABLE public.pacing_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_settings TO authenticated;
GRANT ALL ON public.pacing_settings TO service_role;
ALTER TABLE public.pacing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.pacing_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =================== TRIGGERS updated_at ===================
CREATE TRIGGER trg_pbg_updated BEFORE UPDATE ON public.pacing_budget_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.pacing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON public.pacing_cooldowns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ps_updated BEFORE UPDATE ON public.pacing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================== SEED SETTINGS ===================
INSERT INTO public.pacing_settings (key, value) VALUES
  ('pushcut_webhook_url', '"https://api.pushcut.io/M3lh8goyH7EMF-FLrv73c/notifications/REGRAS"'::jsonb),
  ('polling_interval_minutes', '2'::jsonb),
  ('default_cooldown_minutes', '30'::jsonb),
  ('max_actions_per_hour', '50'::jsonb),
  ('dry_run_global', 'false'::jsonb),
  ('timezone', '"America/Sao_Paulo"'::jsonb),
  ('default_currency', '"BRL"'::jsonb),
  ('exchange_rates', '{"USD":5.40,"EUR":6.30,"HUF":0.015}'::jsonb),
  ('daily_summary_enabled', 'true'::jsonb),
  ('daily_summary_hour_brt', '9'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =================== REALTIME ===================
ALTER PUBLICATION supabase_realtime ADD TABLE public.pacing_budget_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pacing_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pacing_action_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pacing_cooldowns;

ALTER TABLE public.pacing_budget_groups REPLICA IDENTITY FULL;
ALTER TABLE public.pacing_rules REPLICA IDENTITY FULL;
ALTER TABLE public.pacing_action_log REPLICA IDENTITY FULL;
ALTER TABLE public.pacing_cooldowns REPLICA IDENTITY FULL;
