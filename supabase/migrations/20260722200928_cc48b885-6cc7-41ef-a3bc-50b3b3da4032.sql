-- F9 Bloco 1.5 — helper require_op_access + guards em 29 RPCs

CREATE OR REPLACE FUNCTION public.require_op_access(p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden: NULL requires super_admin' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid())
            OR EXISTS(SELECT 1 FROM public.operation_members
                      WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden: no membership' USING ERRCODE='42501';
    END IF;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.require_op_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_op_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_op_access_array(p_operation_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op uuid;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  IF p_operation_ids IS NULL OR array_length(p_operation_ids,1) IS NULL THEN
    RAISE EXCEPTION 'forbidden: empty ids requires super_admin' USING ERRCODE='42501';
  END IF;
  FOREACH op IN ARRAY p_operation_ids LOOP
    PERFORM public.require_op_access(op);
  END LOOP;
END; $$;
REVOKE EXECUTE ON FUNCTION public.require_op_access_array(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_op_access_array(uuid[]) TO authenticated, service_role;

GRANT SELECT ON public.v_expiring_credentials TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_operation_credential(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_meta_credential_by_account(uuid, text) FROM anon, authenticated;