-- F9 DIA 1.C.c — 15 S strict_op_scope + 3 ★B cross_op_ok + view consolidada + índice
-- Ordem: view → 15 S → 3 ★B → índice

-- ============================================================
-- 1) VIEW meta_account_financials_consolidated (herda RLS strict via security_invoker)
-- ============================================================
DROP VIEW IF EXISTS public.meta_account_financials_consolidated;
CREATE VIEW public.meta_account_financials_consolidated
WITH (security_invoker = true) AS
SELECT
  operation_id,
  currency,
  COUNT(*) AS accounts_count,
  SUM(COALESCE(amount_spent, 0)) AS total_amount_spent,
  SUM(COALESCE(account_balance, 0)) AS total_account_balance,
  SUM(COALESCE(spend_cap, 0)) AS total_spend_cap,
  SUM(GREATEST(COALESCE(spend_cap, 0) - COALESCE(amount_spent, 0), 0)) AS total_remaining_cap,
  MAX(updated_at) AS last_updated
FROM public.meta_account_financials
GROUP BY operation_id, currency;

COMMENT ON VIEW public.meta_account_financials_consolidated IS
  'F9 1.C.c — View agregada por operation_id + currency. security_invoker=true herda RLS strict da tabela base (aplicada em 1.C.b). Colunas PII OMITIDAS: account_id, account_name, payment_method_type, card_brand, card_last4. Para auditoria com esses campos, use a tabela raw meta_account_financials com cross_op_intent()=true.';

GRANT SELECT ON public.meta_account_financials_consolidated TO authenticated, service_role;

-- ============================================================
-- 2) 15 S — strict_op_scope
-- ============================================================
DO $$
DECLARE
  t text;
  s_tables text[] := ARRAY[
    'meta_payment_transactions','payoneer_transactions','daily_card_charges',
    'treasury_topups','cashflow_adjustments','cashflow_settings','fixed_costs',
    'variable_costs','manual_adjustments','product_margin_settings',
    'planning_goals','monthly_goals','channel_performance_goals',
    'reconciliation_alerts','media_channels'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY s_tables LOOP
    -- Drop all existing policies
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Apply strict_op_scope quartet
    EXECUTE format($f$CREATE POLICY "strict_op_scope_select" ON public.%I FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "strict_op_scope_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "strict_op_scope_update" ON public.%I FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id))$f$, t);
    EXECUTE format($f$CREATE POLICY "strict_op_scope_delete" ON public.%I FOR DELETE TO authenticated USING (public.strict_op_scope(operation_id) AND (public.admin_da_op(operation_id) OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())))$f$, t);
  END LOOP;
END $$;

-- ============================================================
-- 3) 3 ★B — cross_op_ok (read livre p/ authenticated, write admin-only)
-- ============================================================
DO $$
DECLARE
  t text;
  b_tables text[] := ARRAY['payment_models','fee_mapping','business_managers'];
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
-- 4) Índice redtrack_events(operation_id) — otimização pós-1.C.b
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_redtrack_events_operation_id
  ON public.redtrack_events (operation_id);
