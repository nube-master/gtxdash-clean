-- Unscheduling old jobs to avoid duplicates
SELECT cron.unschedule('sync-meta-today-30min');
SELECT cron.unschedule('sync-meta-fast-30min');

-- Scheduling new 5-minute job
SELECT cron.schedule(
  'sync-meta-today-5min',
  '*/5 * * * *',
  $q$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-today',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  );
  $q$
);