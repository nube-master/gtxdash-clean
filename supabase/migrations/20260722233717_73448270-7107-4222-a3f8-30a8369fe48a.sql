
-- Trigger que impede vincular destinatário e template de operações diferentes.
-- Templates globais (is_system=true AND operation_id IS NULL) continuam permitidos para qualquer destinatário.
CREATE OR REPLACE FUNCTION public.enforce_notification_pref_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_op uuid;
  t_op uuid;
  t_system boolean;
BEGIN
  SELECT operation_id INTO r_op FROM public.notification_recipients WHERE id = NEW.recipient_id;
  SELECT operation_id, is_system INTO t_op, t_system FROM public.notification_templates WHERE id = NEW.template_id;

  -- Template global (system + sem op) pode ser usado por qualquer destinatário
  IF t_system = true AND t_op IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se o destinatário é de uma operação, o template TEM que ser da mesma operação
  IF r_op IS NOT NULL AND t_op IS NOT NULL AND r_op <> t_op THEN
    RAISE EXCEPTION 'Tenant scope violation: recipient % (op=%) cannot subscribe to template % (op=%)',
      NEW.recipient_id, r_op, NEW.template_id, t_op
      USING ERRCODE = '42501';
  END IF;

  -- Se um dos dois é NULL mas o outro não, também bloqueia (evita legado ambíguo em novas prefs)
  IF (r_op IS NULL) <> (t_op IS NULL) THEN
    RAISE EXCEPTION 'Tenant scope violation: recipient op=% and template op=% must both be set or template must be is_system global',
      r_op, t_op
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_notification_pref_tenant_scope ON public.recipient_notification_prefs;
CREATE TRIGGER trg_enforce_notification_pref_tenant_scope
BEFORE INSERT OR UPDATE ON public.recipient_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_pref_tenant_scope();
