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
    -- STRICT MODE (DIA 3+)
    -- Opção A: SA sem contexto ativo mantém bypass legacy (dívida técnica: wire-up GUC no Bloco 6)
    IF v_is_sa AND v_current IS NULL THEN RETURN true; END IF;

    -- Membros: strict rígido
    IF v_current IS NOT NULL AND row_op = v_current THEN RETURN true; END IF;
    IF v_is_sa AND public._is_cross_op_intent() THEN RETURN true; END IF;
    RETURN false;
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