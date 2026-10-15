
-- ============================================================================
-- F9 DIA 1.B — strict_op_scope × 15 core tables + pacing_action_log.operation_id
-- ============================================================================

-- ============ HELPERS ============

CREATE OR REPLACE FUNCTION public.audit_tool_bypass()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(current_setting('app.audit_bypass', true) = 'on', false)
     AND EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.strict_op_scope(_op_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _op_id IS NOT NULL AND (
      public.live_user_in_operation(_op_id)
      OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
      OR public.audit_tool_bypass()
    )
$$;

GRANT EXECUTE ON FUNCTION public.strict_op_scope(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.audit_tool_bypass()  TO authenticated, anon, service_role;

-- ============ pacing_action_log: aditiva operation_id (3-tier backfill) ============

ALTER TABLE public.pacing_action_log
  ADD COLUMN IF NOT EXISTS operation_id uuid;

-- Tier 1: via rule_id → pacing_rules.operation_id
UPDATE public.pacing_action_log pal
SET operation_id = pr.operation_id
FROM public.pacing_rules pr
WHERE pal.operation_id IS NULL
  AND pal.rule_id = pr.id
  AND pr.operation_id IS NOT NULL;

-- Tier 2: via campaign_id → meta_campaign_status.operation_id
UPDATE public.pacing_action_log pal
SET operation_id = mcs.operation_id
FROM public.meta_campaign_status mcs
WHERE pal.operation_id IS NULL
  AND pal.campaign_id = mcs.campaign_id
  AND mcs.operation_id IS NOT NULL;

-- Tier 3: via account_id → meta_ad_accounts.operation_id (resolve os 8 órfãos residuais)
UPDATE public.pacing_action_log pal
SET operation_id = maa.operation_id
FROM public.meta_ad_accounts maa
WHERE pal.operation_id IS NULL
  AND pal.account_id = maa.account_id
  AND maa.operation_id IS NOT NULL;

-- Validação hard: zero órfãos ou aborta
DO $$
DECLARE orphans int;
BEGIN
  SELECT COUNT(*) INTO orphans FROM public.pacing_action_log WHERE operation_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'F9 DIA1B abort: % pacing_action_log rows sem operation_id após 3-tier backfill', orphans;
  END IF;
END $$;

ALTER TABLE public.pacing_action_log
  ALTER COLUMN operation_id SET NOT NULL;

ALTER TABLE public.pacing_action_log
  ADD CONSTRAINT pacing_action_log_operation_id_fkey
  FOREIGN KEY (operation_id) REFERENCES public.operations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pacing_action_log_operation_id
  ON public.pacing_action_log(operation_id);

-- ============ DROP LEGACY POLICIES (15 tables) ============

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        'campaign_mapping_rules','funnel_projects','integration_logs',
        'live_sale_attribution','live_viewers','meta_ad_accounts',
        'offers','pacing_action_log','pacing_evaluation_log','sales_data',
        'traffic_breakdowns','traffic_data','traffic_data_hourly',
        'vsl_data','vturb_performance_daily'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Ensure RLS enabled
ALTER TABLE public.campaign_mapping_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sale_attribution    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_viewers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacing_action_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacing_evaluation_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_data               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_breakdowns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_data             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_data_hourly      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsl_data                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vturb_performance_daily  ENABLE ROW LEVEL SECURITY;

-- ============ CREATE strict_op_scope POLICIES × 15 ============
-- Padrão por tabela: 4 policies (select/insert/update/delete)
-- DELETE exige admin da operação (has_role admin) OU super_admin OU audit_bypass

-- Helper macro via loop
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'campaign_mapping_rules','funnel_projects','integration_logs',
    'live_sale_attribution','live_viewers','meta_ad_accounts',
    'offers','pacing_action_log','pacing_evaluation_log','sales_data',
    'traffic_breakdowns','traffic_data','traffic_data_hourly',
    'vsl_data','vturb_performance_daily'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY strict_op_scope_select ON public.%I FOR SELECT TO authenticated USING (public.strict_op_scope(operation_id))', t);
    EXECUTE format(
      'CREATE POLICY strict_op_scope_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.strict_op_scope(operation_id))', t);
    EXECUTE format(
      'CREATE POLICY strict_op_scope_update ON public.%I FOR UPDATE TO authenticated USING (public.strict_op_scope(operation_id)) WITH CHECK (public.strict_op_scope(operation_id))', t);
    EXECUTE format(
      $sql$CREATE POLICY strict_op_scope_delete ON public.%I FOR DELETE TO authenticated USING (
        (public.strict_op_scope(operation_id) AND public.has_role(auth.uid(),'admin'::app_role))
        OR EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
        OR public.audit_tool_bypass()
      )$sql$, t);
  END LOOP;
END $$;

-- Ensure grants (defense-in-depth; some legacy tables may have been missing)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_mapping_rules   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_projects          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_logs         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sale_attribution    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_viewers             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_accounts         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers                   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_action_log        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacing_evaluation_log    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_data               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_breakdowns       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_data             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_data_hourly      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vsl_data                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vturb_performance_daily  TO authenticated;

GRANT ALL ON public.campaign_mapping_rules,public.funnel_projects,public.integration_logs,
             public.live_sale_attribution,public.live_viewers,public.meta_ad_accounts,
             public.offers,public.pacing_action_log,public.pacing_evaluation_log,
             public.sales_data,public.traffic_breakdowns,public.traffic_data,
             public.traffic_data_hourly,public.vsl_data,public.vturb_performance_daily
        TO service_role;

-- ============ Marca no _migration_log ============
INSERT INTO public._migration_log (phase, step, status, completed_at, metadata)
VALUES ('F9.DIA1B','strict_op_scope_15_core','completed', now(),
  jsonb_build_object(
    'tables_count', 15,
    'policies_created', 60,
    'helpers', jsonb_build_array('strict_op_scope','audit_tool_bypass'),
    'pacing_action_log_backfill', jsonb_build_object(
      'total_rows', 209883,
      'tier_a_rule_id', 2715,
      'tier_b_campaign_id', 207160,
      'tier_c_account_id', 8,
      'orphans_final', 0
    ),
    'rollback_file', '/mnt/documents/f9_dia1b/ROLLBACK_F9_DIA1B.sql'
  )
);
