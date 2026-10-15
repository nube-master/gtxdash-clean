
-- Criar novo cron para FAHTO chamando a nova edge function
SELECT cron.schedule(
  'sync-meta-today-fahto-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-today-fahto',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
