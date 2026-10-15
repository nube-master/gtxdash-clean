-- Move pulse-1h from minute 0 to minute 10, so it runs AFTER sync-meta-hourly (minute 5)
SELECT cron.unschedule(10);

SELECT cron.schedule(
  'pulse-1h',
  '10 * * * *',
  $$
  select
    net.http_post(
        url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/pulse-1h',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);