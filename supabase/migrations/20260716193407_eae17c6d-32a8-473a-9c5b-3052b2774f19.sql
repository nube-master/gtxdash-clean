-- F9 DIA 1.C.a — strict_op_scope em 8 tabelas (pacing engine + newsbreak + credentials guard)
-- Substitui 'Authenticated full access' (AFA) e 'AFA+tenant' por 4 policies strict_op_scope.
-- operation_credentials: explicita 4 policies super_admin-only (defesa em profundidade vs ALL genérico).

-- ============================================================
-- 1) pacing_rules — remove AFA, aplica strict
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access" ON public.pacing_rules;
CREATE POLICY "strict_op_scope_select" ON public.pacing_rules FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.pacing_rules FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.pacing_rules FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.pacing_rules FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 2) pacing_settings
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access" ON public.pacing_settings;
CREATE POLICY "strict_op_scope_select" ON public.pacing_settings FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.pacing_settings FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.pacing_settings FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.pacing_settings FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 3) pacing_budget_groups
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access" ON public.pacing_budget_groups;
CREATE POLICY "strict_op_scope_select" ON public.pacing_budget_groups FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.pacing_budget_groups FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.pacing_budget_groups FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.pacing_budget_groups FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 4) pacing_cooldowns
-- ============================================================
DROP POLICY IF EXISTS "Authenticated full access" ON public.pacing_cooldowns;
CREATE POLICY "strict_op_scope_select" ON public.pacing_cooldowns FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.pacing_cooldowns FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.pacing_cooldowns FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.pacing_cooldowns FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 5) newsbreak_ad_accounts — CRÍTICO (access_token). Remove AFA+tenant coexistente.
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on newsbreak_ad_accounts" ON public.newsbreak_ad_accounts;
DROP POLICY IF EXISTS "Users manage accounts of their operation" ON public.newsbreak_ad_accounts;
DROP POLICY IF EXISTS "Users see accounts of their operation" ON public.newsbreak_ad_accounts;
CREATE POLICY "strict_op_scope_select" ON public.newsbreak_ad_accounts FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.newsbreak_ad_accounts FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));
CREATE POLICY "strict_op_scope_update" ON public.newsbreak_ad_accounts FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.newsbreak_ad_accounts FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 6) newsbreak_campaign_status — CRÍTICO AFA+tenant
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on newsbreak_campaign_status" ON public.newsbreak_campaign_status;
DROP POLICY IF EXISTS "Users see campaigns of their operation" ON public.newsbreak_campaign_status;
CREATE POLICY "strict_op_scope_select" ON public.newsbreak_campaign_status FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.newsbreak_campaign_status FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.newsbreak_campaign_status FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.newsbreak_campaign_status FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 7) newsbreak_traffic_data — CRÍTICO AFA+tenant
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on newsbreak_traffic_data" ON public.newsbreak_traffic_data;
DROP POLICY IF EXISTS "Users see traffic of their operation" ON public.newsbreak_traffic_data;
CREATE POLICY "strict_op_scope_select" ON public.newsbreak_traffic_data FOR SELECT TO authenticated
  USING (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_insert" ON public.newsbreak_traffic_data FOR INSERT TO authenticated
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_update" ON public.newsbreak_traffic_data FOR UPDATE TO authenticated
  USING (public.strict_op_scope(operation_id))
  WITH CHECK (public.strict_op_scope(operation_id));
CREATE POLICY "strict_op_scope_delete" ON public.newsbreak_traffic_data FOR DELETE TO authenticated
  USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())));

-- ============================================================
-- 8) operation_credentials — DEFESA EM PROFUNDIDADE
-- Substitui ALL super_admin-only por 4 policies explícitas super_admin-only.
-- Mesma semântica; ganho: cada comando tem policy nomeada (não pode ser afrouxado por acidente).
-- Wrapper get_operation_credentials() continua sendo único caminho autorizado (SECURITY DEFINER).
-- ============================================================
DROP POLICY IF EXISTS "op_creds_super_admin_only" ON public.operation_credentials;
CREATE POLICY "op_creds_select_super_admin" ON public.operation_credentials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_creds_insert_super_admin" ON public.operation_credentials FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_creds_update_super_admin" ON public.operation_credentials FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));
CREATE POLICY "op_creds_delete_super_admin" ON public.operation_credentials FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));