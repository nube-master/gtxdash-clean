-- Trigger preventivo: bloqueia duplicatas Meta CAPI (sem clickid) quando já existe
-- um evento legítimo (com clickid) no mesmo utm_campaign nas últimas 2h.
-- Não deleta, apenas renomeia event_type para 'purchase_dup' (auditável).

CREATE OR REPLACE FUNCTION public.dedupe_redtrack_capi_ghosts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'purchase'
     AND NEW.clickid IS NULL
     AND NEW.utm_campaign IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.redtrack_events r
       WHERE r.event_type = 'purchase'
         AND r.clickid IS NOT NULL
         AND r.utm_campaign = NEW.utm_campaign
         AND ABS(EXTRACT(EPOCH FROM (r.occurred_at - NEW.occurred_at))) < 7200
         AND r.id IS DISTINCT FROM NEW.id
     )
  THEN
    NEW.event_type := 'purchase_dup';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dedupe_capi_ghosts ON public.redtrack_events;
CREATE TRIGGER trg_dedupe_capi_ghosts
  BEFORE INSERT ON public.redtrack_events
  FOR EACH ROW
  EXECUTE FUNCTION public.dedupe_redtrack_capi_ghosts();