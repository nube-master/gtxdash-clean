-- F9 DIA 1.C.b — strict_op_scope em 13 tabelas (11 S + 2 B)

-- Helper macro: for STRICT tables, drop old wide policies and apply 4 strict policies.

-- ============================================================
-- 1) redtrack_events (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read redtrack_events" ON public.redtrack_events;
DROP POLICY IF EXISTS "Allow service insert redtrack_events" ON public.redtrack_events;
DROP POLICY IF EXISTS "Allow service update redtrack_events" ON public.redtrack_events;
DROP POLICY IF EXISTS "Allow service delete redtrack_events" ON public.redtrack_events;
CREATE POLICY "strict_op_scope_select" ON public.redtrack_events FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.redtrack_events FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.redtrack_events FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.redtrack_events FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 2) meta_campaign_status (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read meta_campaign_status" ON public.meta_campaign_status;
DROP POLICY IF EXISTS "Allow service insert meta_campaign_status" ON public.meta_campaign_status;
DROP POLICY IF EXISTS "Allow service update meta_campaign_status" ON public.meta_campaign_status;
DROP POLICY IF EXISTS "Allow service delete meta_campaign_status" ON public.meta_campaign_status;
CREATE POLICY "strict_op_scope_select" ON public.meta_campaign_status FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.meta_campaign_status FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.meta_campaign_status FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.meta_campaign_status FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 3) meta_spend_realtime_safe (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read meta_spend_realtime_safe" ON public.meta_spend_realtime_safe;
DROP POLICY IF EXISTS "Allow service insert meta_spend_realtime_safe" ON public.meta_spend_realtime_safe;
DROP POLICY IF EXISTS "Allow service update meta_spend_realtime_safe" ON public.meta_spend_realtime_safe;
DROP POLICY IF EXISTS "Allow service delete meta_spend_realtime_safe" ON public.meta_spend_realtime_safe;
CREATE POLICY "strict_op_scope_select" ON public.meta_spend_realtime_safe FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.meta_spend_realtime_safe FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.meta_spend_realtime_safe FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.meta_spend_realtime_safe FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 4) daily_totals_snapshot (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read daily_totals_snapshot" ON public.daily_totals_snapshot;
DROP POLICY IF EXISTS "Allow service insert daily_totals_snapshot" ON public.daily_totals_snapshot;
DROP POLICY IF EXISTS "Allow service update daily_totals_snapshot" ON public.daily_totals_snapshot;
CREATE POLICY "strict_op_scope_select" ON public.daily_totals_snapshot FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.daily_totals_snapshot FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.daily_totals_snapshot FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.daily_totals_snapshot FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 5) system_daily_snapshot (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read system_daily_snapshot" ON public.system_daily_snapshot;
DROP POLICY IF EXISTS "Allow service insert system_daily_snapshot" ON public.system_daily_snapshot;
DROP POLICY IF EXISTS "Allow service delete system_daily_snapshot" ON public.system_daily_snapshot;
CREATE POLICY "strict_op_scope_select" ON public.system_daily_snapshot FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.system_daily_snapshot FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.system_daily_snapshot FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.system_daily_snapshot FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 6) account_status_log (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read account_status_log" ON public.account_status_log;
DROP POLICY IF EXISTS "Allow service insert account_status_log" ON public.account_status_log;
CREATE POLICY "strict_op_scope_select" ON public.account_status_log FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.account_status_log FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.account_status_log FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.account_status_log FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 7) account_utm_aliases (S)
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated read account_utm_aliases" ON public.account_utm_aliases;
DROP POLICY IF EXISTS "Allow authenticated insert account_utm_aliases" ON public.account_utm_aliases;
DROP POLICY IF EXISTS "Allow authenticated update account_utm_aliases" ON public.account_utm_aliases;
DROP POLICY IF EXISTS "Allow authenticated delete account_utm_aliases" ON public.account_utm_aliases;
CREATE POLICY "strict_op_scope_select" ON public.account_utm_aliases FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.account_utm_aliases FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.account_utm_aliases FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.account_utm_aliases FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 8) team_members (S)
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated read team_members" ON public.team_members;
DROP POLICY IF EXISTS "Allow authenticated insert team_members" ON public.team_members;
DROP POLICY IF EXISTS "Allow authenticated update team_members" ON public.team_members;
DROP POLICY IF EXISTS "Allow authenticated delete team_members" ON public.team_members;
CREATE POLICY "strict_op_scope_select" ON public.team_members FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.team_members FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));
CREATE POLICY "strict_op_scope_update" ON public.team_members FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.team_members FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 9) clickbank_audit (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read clickbank_audit" ON public.clickbank_audit;
DROP POLICY IF EXISTS "Allow service insert clickbank_audit" ON public.clickbank_audit;
DROP POLICY IF EXISTS "Allow service delete clickbank_audit" ON public.clickbank_audit;
CREATE POLICY "strict_op_scope_select" ON public.clickbank_audit FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.clickbank_audit FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.clickbank_audit FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.clickbank_audit FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 10) system_health_logs (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read system_health_logs" ON public.system_health_logs;
DROP POLICY IF EXISTS "Allow service insert system_health_logs" ON public.system_health_logs;
DROP POLICY IF EXISTS "Allow service delete system_health_logs" ON public.system_health_logs;
CREATE POLICY "strict_op_scope_select" ON public.system_health_logs FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.system_health_logs FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.system_health_logs FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.system_health_logs FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 11) meta_account_financials (S)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read meta_account_financials" ON public.meta_account_financials;
DROP POLICY IF EXISTS "Allow service insert meta_account_financials" ON public.meta_account_financials;
DROP POLICY IF EXISTS "Allow service update meta_account_financials" ON public.meta_account_financials;
DROP POLICY IF EXISTS "Allow service delete meta_account_financials" ON public.meta_account_financials;
CREATE POLICY "strict_op_scope_select" ON public.meta_account_financials FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.meta_account_financials FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.meta_account_financials FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.meta_account_financials FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 12) spy_ad_insights (★ B — cross-op OK, Ad Library data)
-- Any authenticated user reads. Writes limited to op admins.
-- ============================================================
DROP POLICY IF EXISTS "spy_ad_insights tenant select" ON public.spy_ad_insights;
DROP POLICY IF EXISTS "spy_ad_insights service all" ON public.spy_ad_insights;
CREATE POLICY "cross_op_read" ON public.spy_ad_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "op_admin_insert" ON public.spy_ad_insights FOR INSERT TO authenticated WITH CHECK (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_admin_update" ON public.spy_ad_insights FOR UPDATE TO authenticated USING (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())) WITH CHECK (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_admin_delete" ON public.spy_ad_insights FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- ============================================================
-- 13) spy_copywriters (★ B — cross-op OK, public profiles)
-- ============================================================
DROP POLICY IF EXISTS "spy_copywriters read all auth" ON public.spy_copywriters;
CREATE POLICY "cross_op_read" ON public.spy_copywriters FOR SELECT TO authenticated USING (true);
CREATE POLICY "op_admin_insert" ON public.spy_copywriters FOR INSERT TO authenticated WITH CHECK (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_admin_update" ON public.spy_copywriters FOR UPDATE TO authenticated USING (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())) WITH CHECK (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_admin_delete" ON public.spy_copywriters FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));