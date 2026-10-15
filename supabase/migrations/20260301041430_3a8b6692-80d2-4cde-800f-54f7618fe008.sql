-- Fix the RedTrack sync cron URL typo (gnpx → gspx)
SELECT cron.alter_job(
  9,
  command := $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/pull-conversions',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$
);