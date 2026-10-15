
SELECT cron.unschedule('redtrack-sync-every-minute');
SELECT cron.unschedule('notify-unsent-sales-every-minute');

SELECT cron.schedule(
  'redtrack-sync-every-3min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/pull-conversions',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'notify-unsent-sales-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/notify-unsent-sales',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
