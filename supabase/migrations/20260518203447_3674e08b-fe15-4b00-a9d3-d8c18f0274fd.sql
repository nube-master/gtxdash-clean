-- Spy v2 Fase 5 — Alerts & Pushcut

CREATE TABLE IF NOT EXISTS public.spy_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  offer_id uuid REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('escalando','new_ads','score_jump','new_offer')),
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  pushcut_sent boolean NOT NULL DEFAULT false,
  pushcut_sent_at timestamptz,
  pushcut_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spy_alerts_op_created_idx ON public.spy_alerts (operation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spy_alerts_offer_idx ON public.spy_alerts (offer_id);
CREATE INDEX IF NOT EXISTS spy_alerts_unread_idx ON public.spy_alerts (operation_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.spy_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spy_alerts tenant select" ON public.spy_alerts FOR SELECT USING (live_user_in_operation(operation_id));
CREATE POLICY "spy_alerts tenant update" ON public.spy_alerts FOR UPDATE USING (live_user_in_operation(operation_id));
CREATE POLICY "spy_alerts tenant insert" ON public.spy_alerts FOR INSERT WITH CHECK (live_user_in_operation(operation_id));
CREATE POLICY "spy_alerts tenant delete" ON public.spy_alerts FOR DELETE USING (live_user_in_operation(operation_id));

-- Trigger: detecta eventos relevantes e insere alerta + dispara pushcut via pg_net
CREATE OR REPLACE FUNCTION public.fn_spy_offers_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_title text;
  v_body text;
  v_payload jsonb;
  v_alert_id uuid;
  v_func_url text;
  v_service_key text;
BEGIN
  -- Escalando: false -> true
  IF TG_OP = 'UPDATE' AND OLD.escalando = false AND NEW.escalando = true THEN
    v_event_type := 'escalando';
    v_title := '🔥 Oferta escalando: ' || NEW.offer_name;
    v_body := COALESCE(NEW.product_name,'') || ' agora tem ' || NEW.active_ads_count || ' ads ativas (score ' || COALESCE(NEW.score::text,'?') || ')';
  -- Score subiu >= 10
  ELSIF TG_OP = 'UPDATE' AND COALESCE(NEW.score,0) - COALESCE(OLD.score,0) >= 10 THEN
    v_event_type := 'score_jump';
    v_title := '📈 Score subiu: ' || NEW.offer_name;
    v_body := 'De ' || COALESCE(OLD.score,0) || ' → ' || NEW.score;
  -- Crescimento de ads ativas >= 5
  ELSIF TG_OP = 'UPDATE' AND NEW.active_ads_count - OLD.active_ads_count >= 5 THEN
    v_event_type := 'new_ads';
    v_title := '➕ Novas ads: ' || NEW.offer_name;
    v_body := '+' || (NEW.active_ads_count - OLD.active_ads_count) || ' ads (total: ' || NEW.active_ads_count || ')';
  -- Insert de oferta nova
  ELSIF TG_OP = 'INSERT' THEN
    v_event_type := 'new_offer';
    v_title := '🆕 Nova oferta: ' || NEW.offer_name;
    v_body := COALESCE(NEW.nicho,'') || ' • ' || COALESCE(NEW.subnicho,'') || ' • ' || COALESCE(NEW.trafego,'');
  ELSE
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'offer_id', NEW.id,
    'offer_name', NEW.offer_name,
    'product_name', NEW.product_name,
    'nicho', NEW.nicho,
    'subnicho', NEW.subnicho,
    'trafego', NEW.trafego,
    'score', NEW.score,
    'active_ads_count', NEW.active_ads_count,
    'category_tab', NEW.category_tab
  );

  INSERT INTO public.spy_alerts (operation_id, offer_id, event_type, title, body, payload)
  VALUES (NEW.operation_id, NEW.id, v_event_type, v_title, v_body, v_payload)
  RETURNING id INTO v_alert_id;

  -- Dispara edge function async (Pushcut) — non-blocking
  v_func_url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/spy-pushcut-notify';
  v_service_key := current_setting('app.settings.service_role_key', true);

  BEGIN
    PERFORM net.http_post(
      url := v_func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_key, 'REDACTED_JWT')
      ),
      body := jsonb_build_object('alert_id', v_alert_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- não bloqueia o update se net falhar
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spy_offers_alert ON public.spy_offers;
CREATE TRIGGER trg_spy_offers_alert
AFTER INSERT OR UPDATE OF escalando, score, active_ads_count
ON public.spy_offers
FOR EACH ROW EXECUTE FUNCTION public.fn_spy_offers_alert();