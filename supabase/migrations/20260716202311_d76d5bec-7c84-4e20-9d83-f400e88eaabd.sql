-- F9 DIA 1.C.d — 41 tabelas: preservações + strict + cross-op + own-user
-- Auth-críticas intocadas: operation_credentials, operation_members, operation_invites

-- ============================================================
-- GRUPO 1: Preservações compostas (5 tabelas)
-- ============================================================

-- talent_jobs: strict + preserva anon read is_active=true
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='talent_jobs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.talent_jobs', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "public_read_active" ON public.talent_jobs FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "strict_op_scope_select" ON public.talent_jobs FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.talent_jobs FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.talent_jobs FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.talent_jobs FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));
GRANT SELECT ON public.talent_jobs TO anon;

-- talent_applications: strict + preserva anon insert
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='talent_applications' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.talent_applications', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "public_insert_application" ON public.talent_applications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "strict_op_scope_select" ON public.talent_applications FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.talent_applications FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.talent_applications FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));
GRANT INSERT ON public.talent_applications TO anon;

-- user_page_permissions: strict + preserva self-read
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_page_permissions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_page_permissions', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "self_read_permissions" ON public.user_page_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "strict_op_scope_select" ON public.user_page_permissions FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.user_page_permissions FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));
CREATE POLICY "strict_op_scope_update" ON public.user_page_permissions FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.user_page_permissions FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- spy_scrape_log: strict + preserva operation_id IS NULL (system-wide scrapes)
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='spy_scrape_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.spy_scrape_log', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "system_scrape_null_op" ON public.spy_scrape_log FOR SELECT TO authenticated USING (operation_id IS NULL);
CREATE POLICY "strict_op_scope_select" ON public.spy_scrape_log FOR SELECT TO authenticated USING (operation_id IS NOT NULL AND public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.spy_scrape_log FOR INSERT TO authenticated WITH CHECK (operation_id IS NULL OR public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.spy_scrape_log FOR UPDATE TO authenticated USING (operation_id IS NULL OR public.strict_op_scope(operation_id)) WITH CHECK (operation_id IS NULL OR public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.spy_scrape_log FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- creative_team_overrides: strict select para membros, super_admin write
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='creative_team_overrides' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.creative_team_overrides', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "strict_op_scope_select" ON public.creative_team_overrides FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "super_admin_write" ON public.creative_team_overrides FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- ============================================================
-- GRUPO 2: 23 S puros — strict_op_scope 4-policy
-- ============================================================
DO $$
DECLARE
  t text;
  s_tables text[] := ARRAY[
    'academy_courses','academy_modules','academy_lessons','academy_lesson_attachments',
    'academy_knowledge','academy_playbooks','automated_reports_log','gtx_data_warnings',
    'gtx_decisions_log','live_events','notification_recipients','offer_status_history',
    'pacing_campaign_hourly_snapshots','recipient_notification_prefs','scale_radar_plans',
    'spy_ads','spy_alerts','spy_history','spy_lps','spy_offer_files','spy_offers',
    'spy_watchlist','system_logs'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY s_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format($f$CREATE POLICY "strict_op_scope_select" ON public.%I FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "strict_op_scope_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "strict_op_scope_update" ON public.%I FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "strict_op_scope_delete" ON public.%I FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())))$f$, t);
  END LOOP;
END $$;

-- ============================================================
-- GRUPO 3: 6 ★B cross_op_ok
-- ============================================================
DO $$
DECLARE
  t text;
  b_tables text[] := ARRAY['exchange_rates_daily','exchange_rate_log','producers','notification_templates','offer_benchmarks','app_settings'];
  pol record;
BEGIN
  FOREACH t IN ARRAY b_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format($f$CREATE POLICY "cross_op_read" ON public.%I FOR SELECT TO authenticated USING (true)$f$, t);
    EXECUTE format($f$CREATE POLICY "op_admin_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "op_admin_update" ON public.%I FOR UPDATE TO authenticated USING (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())) WITH CHECK (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "op_admin_delete" ON public.%I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))$f$, t);
  END LOOP;
END $$;

-- ============================================================
-- GRUPO 4: 7 Own-user (user_id-scoped)
-- ============================================================

-- Pure own-user (6): jarvis_conversations, jarvis_messages, notification_settings, academy_lesson_progress, spy_favorites
DO $$
DECLARE
  t text;
  own_tables text[] := ARRAY['jarvis_conversations','jarvis_messages','notification_settings','academy_lesson_progress','spy_favorites'];
  pol record;
BEGIN
  FOREACH t IN ARRAY own_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format($f$CREATE POLICY "own_user_select" ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "own_user_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())$f$, t);
    EXECUTE format($f$CREATE POLICY "own_user_update" ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())$f$, t);
    EXECUTE format($f$CREATE POLICY "own_user_delete" ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())$f$, t);
  END LOOP;
END $$;

-- user_activity_logs: own_user select + admin_da_op audit read + system insert
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_activity_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_activity_logs', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "own_user_select" ON public.user_activity_logs FOR SELECT TO authenticated USING (user_id = auth.uid() OR (public.strict_op_scope(operation_id) AND public.admin_da_op(operation_id)) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "own_user_insert" ON public.user_activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_user_delete" ON public.user_activity_logs FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- academy_comments: hybrid — read strict per-op, write own_user + strict
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='academy_comments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.academy_comments', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY "strict_op_scope_select" ON public.academy_comments FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "own_user_insert" ON public.academy_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.strict_op_scope(operation_id));
CREATE POLICY "own_user_update" ON public.academy_comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_user_delete" ON public.academy_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
