-- DÍVIDA 3
CREATE OR REPLACE FUNCTION public._check_prefs_operation_match()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_recipient_op UUID;
BEGIN
  SELECT operation_id INTO v_recipient_op
  FROM public.notification_recipients
  WHERE id = NEW.recipient_id;
  IF v_recipient_op IS NULL THEN
    RAISE EXCEPTION 'recipient_id % não existe', NEW.recipient_id;
  END IF;
  IF v_recipient_op <> NEW.operation_id THEN
    RAISE EXCEPTION 'operation_id da pref (%) não bate com operation_id do recipient (%)',
      NEW.operation_id, v_recipient_op;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prefs_operation_match ON public.recipient_notification_prefs;
CREATE TRIGGER trg_prefs_operation_match
  BEFORE INSERT OR UPDATE ON public.recipient_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public._check_prefs_operation_match();

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.A', 'trigger_prefs_op_match', 'recipient_notification_prefs','completed', NOW(),
        jsonb_build_object('type', 'BEFORE_INSERT_UPDATE_trigger',
                          'purpose', 'cross-check op_id vs recipient.op_id'));

-- DÍVIDA 4
CREATE OR REPLACE FUNCTION public._check_application_operation_match()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_job_op UUID;
BEGIN
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;
  SELECT operation_id INTO v_job_op
  FROM public.talent_jobs
  WHERE id = NEW.job_id;
  IF v_job_op IS NULL THEN
    RAISE EXCEPTION 'job_id % não existe', NEW.job_id;
  END IF;
  IF v_job_op <> NEW.operation_id THEN
    RAISE EXCEPTION 'operation_id da candidatura (%) não bate com da vaga (%)',
      NEW.operation_id, v_job_op;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_operation_match ON public.talent_applications;
CREATE TRIGGER trg_application_operation_match
  BEFORE INSERT OR UPDATE ON public.talent_applications
  FOR EACH ROW EXECUTE FUNCTION public._check_application_operation_match();

INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.A', 'trigger_application_op_match', 'talent_applications','completed', NOW(),
        jsonb_build_object('type', 'BEFORE_INSERT_UPDATE_trigger',
                          'purpose', 'cross-check op_id vs job.op_id',
                          'note', 'job_id NULL permitido (candidatura espontânea)'));

-- DÍVIDA 1: registra timeout
INSERT INTO _migration_log(phase, step, table_name, status, completed_at, metadata)
VALUES ('F8.A', 'validate_fk_live_events_DEFERRED', 'live_events','skipped', NOW(),
        jsonb_build_object('reason','statement timeout em LEFT JOIN de 16M rows',
                          'next_step','rodar fora do painel (psql direto com SET statement_timeout=0)'));
