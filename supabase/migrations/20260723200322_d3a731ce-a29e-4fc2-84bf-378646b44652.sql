CREATE OR REPLACE FUNCTION public.require_op_access(p_operation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role (edge functions / server-side jobs) bypasses membership check.
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

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
END;
$function$;