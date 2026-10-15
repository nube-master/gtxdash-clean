-- Reschedule Newsbreak sync from 30min to 10min
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sync-newsbreak-every-30min';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sync-newsbreak-every-10min';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'sync-newsbreak-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-newsbreak',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer REDACTED_JWT"}'::jsonb,
    body := '{"days": 7}'::jsonb
  );
  $$
);