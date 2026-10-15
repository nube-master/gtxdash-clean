SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sync-meta-today-5min'),
  command := $cmd$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-today',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{"operation_id":"0b758a2b-1b92-4769-b47b-416c567e320d"}'::jsonb
  );
  $cmd$
);