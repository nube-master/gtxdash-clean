-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create cron job to sync RedTrack every 1 minute
SELECT cron.schedule(
  'redtrack-sync-every-minute',
  '* * * * *',
  $$
  SELECT extensions.http((
    'POST',
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/health-check?action=redtrack-sync',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{}'
  )::extensions.http_request);
  $$
);