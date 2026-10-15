
-- =====================================================
-- F9 DIA 1.A — Foundation for Strict Tenant Isolation
-- Nothing changes in production behavior until DIA 3.
-- =====================================================

-- 1) _current_op(): reads app.active_operation GUC (NULL-safe)
CREATE OR REPLACE FUNCTION public._current_op()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    v := current_setting('app.active_operation', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  BEGIN
    RETURN v::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

-- 2) _is_cross_op_intent(): reads app.cross_op_intent GUC
CREATE OR REPLACE FUNCTION public._is_cross_op_intent()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    v := current_setting('app.cross_op_intent', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN COALESCE(v, '') = 'true';
END;
$$;

-- 3) is_super_admin(uuid): stable predicate, SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = _user_id
  );
$$;

-- 4) _op_scope_check(row_op): CENTRAL predicate reused by every DIA 1.B/1.C policy.
-- Semantics:
--   Flag OFF (default today) → legacy behavior: allow if row belongs to a member's op
--                              OR user is super_admin (unrestricted bypass).
--   Flag ON  (DIA 3+)        → strict: only current session's active op,
--                              super_admin needs explicit cross_op_intent.
CREATE OR REPLACE FUNCTION public._op_scope_check(row_op uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current uuid := public._current_op();
  v_strict boolean := public._flag_on('strict_tenant_isolation', row_op);
  v_is_sa boolean := (v_uid IS NOT NULL AND public.is_super_admin(v_uid));
BEGIN
  IF row_op IS NULL THEN
    -- rows without operation_id fall through to underlying policy defaults
    RETURN v_is_sa;
  END IF;

  IF v_strict THEN
    -- STRICT MODE (DIA 3+)
    IF v_current IS NOT NULL AND row_op = v_current THEN RETURN true; END IF;
    IF v_is_sa AND public._is_cross_op_intent() THEN RETURN true; END IF;
    RETURN false;
  ELSE
    -- LEGACY MODE (today, until flag flips)
    IF v_is_sa THEN RETURN true; END IF;
    IF v_current IS NOT NULL AND row_op = v_current THEN RETURN true; END IF;
    -- fallback to active membership check (mirrors current F7 behavior)
    RETURN EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE operation_id = row_op
        AND user_id = v_uid
        AND status = 'active'
    );
  END IF;
END;
$$;

-- 5) _enable_cross_op(reason): admin escape hatch (session-scoped)
CREATE OR REPLACE FUNCTION public._enable_cross_op(p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'cross_op_intent restricted to super_admins';
  END IF;
  PERFORM set_config('app.cross_op_intent', 'true', true);
  INSERT INTO public.system_logs (level, event, message, metadata)
  VALUES (
    'info',
    'cross_op_intent_enabled',
    COALESCE(p_reason, 'no_reason'),
    jsonb_build_object('user_id', v_uid, 'ts', now())
  );
END;
$$;

-- 6) Wrapper: get_operation_credentials — audited read of sensitive vault refs
CREATE OR REPLACE FUNCTION public.get_operation_credentials(
  p_operation_id uuid,
  p_audit_tool_bypass boolean DEFAULT false
)
RETURNS SETOF public.operation_credentials
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_sa boolean;
  v_is_member boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_is_sa := public.is_super_admin(v_uid);
  v_is_member := EXISTS (
    SELECT 1 FROM public.operation_members
    WHERE operation_id = p_operation_id
      AND user_id = v_uid
      AND status = 'active'
      AND role IN ('owner','admin','manager')
  );

  IF NOT (v_is_sa OR v_is_member) THEN
    RAISE EXCEPTION 'not authorized to read credentials for %', p_operation_id;
  END IF;

  -- Audit every access
  INSERT INTO public.system_logs (level, event, message, metadata)
  VALUES (
    'info',
    'operation_credentials_read',
    'get_operation_credentials',
    jsonb_build_object(
      'user_id', v_uid,
      'operation_id', p_operation_id,
      'is_super_admin', v_is_sa,
      'audit_tool_bypass', p_audit_tool_bypass,
      'ts', now()
    )
  );

  RETURN QUERY
    SELECT * FROM public.operation_credentials
    WHERE operation_id = p_operation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operation_credentials(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public._enable_cross_op(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._current_op() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._is_cross_op_intent() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._op_scope_check(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, anon;

-- 7) REVOKE direct SELECT on operation_credentials from client roles.
--    service_role (edge functions) keeps ALL privileges → zero retrofit needed.
REVOKE SELECT ON public.operation_credentials FROM authenticated;
REVOKE SELECT ON public.operation_credentials FROM anon;
GRANT ALL ON public.operation_credentials TO service_role;

-- 8) Feature flag: strict_tenant_isolation (DEFAULT OFF)
INSERT INTO public.feature_flags (key, enabled, operation_ids, description)
VALUES (
  'strict_tenant_isolation',
  false,
  ARRAY[]::uuid[],
  'F9: Kill-switch para isolamento estrito multi-tenant. OFF=legacy (super_admin bypass, membership fallback). ON=strict (só operação ativa; super_admin precisa chamar _enable_cross_op para cruzar). Rollout: DIA 3 canary GTX → global. Semântica lida por _op_scope_check(row_op).'
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;
