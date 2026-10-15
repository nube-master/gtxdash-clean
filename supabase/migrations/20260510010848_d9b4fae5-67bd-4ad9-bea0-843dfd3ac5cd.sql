
-- ===== LIVE VIEWERS =====
CREATE TABLE public.live_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  player_id text NOT NULL,
  player_name text,
  clickid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  ad_id text,
  account_id text,
  operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  product text,
  country text,
  state text,
  city text,
  device_type text CHECK (device_type IN ('mobile','desktop','tablet','unknown')) DEFAULT 'unknown',
  user_agent text,
  ip_hash text,
  current_second_in_video numeric DEFAULT 0,
  pitch_reached boolean DEFAULT false,
  cta_clicked boolean DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  exit_reason text CHECK (exit_reason IN ('active','exited','timeout','cta_click','purchase')) DEFAULT 'active',
  CONSTRAINT live_viewers_session_player_uniq UNIQUE (session_id, player_id)
);

CREATE INDEX live_viewers_player_lastseen ON public.live_viewers (player_id, last_seen_at DESC);
CREATE INDEX live_viewers_lastseen ON public.live_viewers (last_seen_at DESC);
CREATE INDEX live_viewers_op ON public.live_viewers (operation_id, last_seen_at DESC);
CREATE INDEX live_viewers_active_idx ON public.live_viewers (exit_reason, last_seen_at DESC);

-- ===== LIVE EVENTS =====
CREATE TABLE public.live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  player_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('vsl_start','heartbeat','pitch_reached','cta_click','exit','timeout','purchase')),
  second_in_video numeric DEFAULT 0,
  clickid text,
  utm_campaign text,
  ad_id text,
  account_id text,
  operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  product text,
  country text,
  device_type text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX live_events_player_created ON public.live_events (player_id, created_at DESC);
CREATE INDEX live_events_session ON public.live_events (session_id);
CREATE INDEX live_events_op_created ON public.live_events (operation_id, created_at DESC);

-- ===== VIEWS =====
CREATE OR REPLACE VIEW public.live_viewers_active AS
SELECT
  player_id,
  player_name,
  operation_id,
  count(*) AS viewers_count,
  count(*) FILTER (WHERE pitch_reached) AS viewers_at_pitch,
  count(*) FILTER (WHERE cta_clicked) AS viewers_at_cta,
  count(*) FILTER (WHERE device_type = 'mobile') AS mobile_count,
  count(*) FILTER (WHERE device_type = 'desktop') AS desktop_count,
  count(*) FILTER (WHERE device_type = 'tablet') AS tablet_count
FROM public.live_viewers
WHERE last_seen_at > now() - interval '30 seconds'
  AND exit_reason = 'active'
GROUP BY player_id, player_name, operation_id;

CREATE OR REPLACE VIEW public.live_viewers_geo AS
SELECT
  player_id,
  operation_id,
  country,
  state,
  count(*) AS viewers_count,
  round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (PARTITION BY player_id), 0), 1) AS pct
FROM public.live_viewers
WHERE last_seen_at > now() - interval '30 seconds'
  AND exit_reason = 'active'
  AND country IS NOT NULL
GROUP BY player_id, operation_id, country, state;

-- ===== REALTIME =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_viewers;

-- ===== RLS =====
ALTER TABLE public.live_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;

-- helper: user belongs to operation
CREATE OR REPLACE FUNCTION public.live_user_in_operation(_op uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _op IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.operation_members
    WHERE operation_id = _op AND user_id = auth.uid() AND status = 'active'
  );
$$;

-- SELECT: admins veem tudo; usuários veem apenas viewers da sua operação
CREATE POLICY "live_viewers_select_own_op"
ON public.live_viewers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR public.live_user_in_operation(operation_id));

CREATE POLICY "live_events_select_own_op"
ON public.live_events FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR public.live_user_in_operation(operation_id));

-- INSERT/UPDATE/DELETE bloqueados via REST (edge functions usam service role e fazem bypass)

-- ===== CRON: cleanup-stale-viewers a cada 1 minuto =====
-- Marca como timeout viewers sem heartbeat há mais de 30s
CREATE OR REPLACE FUNCTION public.cleanup_stale_live_viewers()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.live_viewers
  SET exit_reason = 'timeout'
  WHERE last_seen_at < now() - interval '30 seconds'
    AND exit_reason = 'active';
$$;

-- agendar
SELECT cron.schedule(
  'cleanup-stale-live-viewers-every-min',
  '* * * * *',
  $$ SELECT public.cleanup_stale_live_viewers(); $$
);
