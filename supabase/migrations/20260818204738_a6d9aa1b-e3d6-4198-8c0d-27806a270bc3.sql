-- Cron polling RedTrack FAHTO a cada 2 minutos (mesmo padrão da GTX)
SELECT cron.unschedule('sync-redtrack-fahto-2min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sync-redtrack-fahto-2min');

SELECT cron.schedule(
  'sync-redtrack-fahto-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-redtrack-fahto',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);