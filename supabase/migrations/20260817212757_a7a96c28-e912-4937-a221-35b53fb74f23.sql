BEGIN;

-- Remover policies antigas que possam conflitar ou ser redundantes
DROP POLICY IF EXISTS strict_op_scope_select ON public.traffic_data;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.traffic_data;
DROP POLICY IF EXISTS strict_op_scope_update ON public.traffic_data;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.traffic_data;

DROP POLICY IF EXISTS strict_op_scope_select ON public.sales_data;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.sales_data;
DROP POLICY IF EXISTS strict_op_scope_update ON public.sales_data;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.sales_data;

DROP POLICY IF EXISTS strict_op_scope_select ON public.cod_orders;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.cod_orders;
DROP POLICY IF EXISTS strict_op_scope_update ON public.cod_orders;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.cod_orders;

DROP POLICY IF EXISTS strict_op_scope_select ON public.redtrack_events;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.redtrack_events;
DROP POLICY IF EXISTS strict_op_scope_update ON public.redtrack_events;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.redtrack_events;

DROP POLICY IF EXISTS strict_op_scope_select ON public.meta_ad_accounts;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.meta_ad_accounts;
DROP POLICY IF EXISTS strict_op_scope_update ON public.meta_ad_accounts;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.meta_ad_accounts;

DROP POLICY IF EXISTS strict_op_scope_select ON public.meta_account_financials;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.meta_account_financials;
DROP POLICY IF EXISTS strict_op_scope_update ON public.meta_account_financials;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.meta_account_financials;

DROP POLICY IF EXISTS strict_op_scope_select ON public.notification_recipients;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.notification_recipients;
DROP POLICY IF EXISTS strict_op_scope_update ON public.notification_recipients;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.notification_recipients;

DROP POLICY IF EXISTS strict_op_scope_select ON public.pacing_action_log;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.pacing_action_log;
DROP POLICY IF EXISTS strict_op_scope_update ON public.pacing_action_log;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.pacing_action_log;

DROP POLICY IF EXISTS strict_op_scope_select ON public.integration_logs;
DROP POLICY IF EXISTS strict_op_scope_insert ON public.integration_logs;
DROP POLICY IF EXISTS strict_op_scope_update ON public.integration_logs;
DROP POLICY IF EXISTS strict_op_scope_delete ON public.integration_logs;

COMMIT;