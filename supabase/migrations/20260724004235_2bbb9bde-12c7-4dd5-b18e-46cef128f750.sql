
CREATE OR REPLACE FUNCTION public._op_scope_check(row_op uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_current uuid := public._current_op();
  v_strict boolean := public._flag_on('strict_tenant_isolation', row_op);
  v_is_sa boolean := (v_uid IS NOT NULL AND public.is_super_admin(v_uid));
BEGIN
  IF row_op IS NULL THEN
    RETURN v_is_sa;
  END IF;

  IF v_strict THEN
    -- STRICT MODE
    -- Super admin sem contexto ativo: bypass legacy
    IF v_is_sa AND v_current IS NULL THEN RETURN true; END IF;

    -- Contexto de operação ativo confere com a linha
    IF v_current IS NOT NULL AND row_op = v_current THEN RETURN true; END IF;

    -- Super admin com intent explícito cross-op
    IF v_is_sa AND public._is_cross_op_intent() THEN RETURN true; END IF;

    -- FIX: membros da operação sempre têm acesso, mesmo sem GUC setado.
    -- O GUC app.active_operation não é setado pelo cliente hoje, então sem
    -- este fallback qualquer visualizador/editor de operação enxerga tudo vazio.
    RETURN EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE operation_id = row_op
        AND user_id = v_uid
        AND status = 'active'
    );
  ELSE
    -- LEGACY MODE
    IF v_is_sa THEN RETURN true; END IF;
    IF v_current IS NOT NULL AND row_op = v_current THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE operation_id = row_op
        AND user_id = v_uid
        AND status = 'active'
    );
  END IF;
END;
$function$;
