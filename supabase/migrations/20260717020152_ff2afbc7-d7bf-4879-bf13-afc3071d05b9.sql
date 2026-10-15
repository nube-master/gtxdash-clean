-- =============================================================================
-- F10 B2: fix _enable_cross_op audit insert (schema mismatch)
-- =============================================================================
CREATE OR REPLACE FUNCTION public._enable_cross_op(p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_op  uuid := public._current_op();
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'cross_op_intent restricted to super_admins';
  END IF;

  PERFORM set_config('app.cross_op_intent', 'true', true);

  -- system_logs schema: (type, function_name, message, metadata, operation_id NOT NULL)
  INSERT INTO public.system_logs (type, function_name, message, metadata, operation_id)
  VALUES (
    'CROSS_OP_INTENT',
    '_enable_cross_op',
    COALESCE(p_reason, 'no_reason'),
    jsonb_build_object('user_id', v_uid, 'ts', now(), 'active_op', v_op),
    COALESCE(v_op, '00000000-0000-0000-0000-000000000000'::uuid)
  );
END;
$function$;

-- =============================================================================
-- F10 B1: pluga kill-switch nas 306 policies via delegação do wrapper interno
-- Assinatura preservada (uuid → boolean, STABLE, SECURITY DEFINER) para não
-- invalidar nenhuma policy que referencia strict_op_scope(operation_id).
-- Preserva audit_tool_bypass para não quebrar ferramental interno.
-- Rollback: reaplicar a versão anterior (SA-bypass hard-coded).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.strict_op_scope(_op_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public._op_scope_check(_op_id) OR public.audit_tool_bypass();
$function$;