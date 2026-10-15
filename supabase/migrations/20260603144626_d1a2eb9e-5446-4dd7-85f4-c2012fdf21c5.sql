-- Permite novo tipo de alerta sync_stalled
ALTER TABLE public.spy_alerts DROP CONSTRAINT IF EXISTS spy_alerts_event_type_check;
ALTER TABLE public.spy_alerts ADD CONSTRAINT spy_alerts_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'escalando','new_ads','score_jump','new_offer','constant_growth',
    'daily_digest','dead_offer','emerging_growth','sync_stalled'
  ]));

-- Cron: roda 2x/dia (10h e 22h BRT = 13h e 01h UTC)
SELECT cron.unschedule('spy-health-check-watchdog') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'spy-health-check-watchdog'
);

SELECT cron.schedule(
  'spy-health-check-watchdog',
  '0 1,13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/spy-health-check',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer REDACTED_JWT"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $$
);