-- Add timezone columns to meta_ad_accounts (corrected table name)
ALTER TABLE public.meta_ad_accounts 
ADD COLUMN IF NOT EXISTS timezone_name TEXT,
ADD COLUMN IF NOT EXISTS timezone_offset_hours_utc INTEGER;

-- Grant permissions (Supabase Cloud required)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_accounts TO authenticated;
GRANT ALL ON public.meta_ad_accounts TO service_role;

-- Update sync-meta-balance cron to 15 min
-- Note: We use net.http_post for Edge Functions in pg_cron as per memory
-- First delete existing if any to avoid duplicates
DELETE FROM cron.job WHERE jobname = 'sync-meta-balance-15m';

SELECT cron.schedule(
  'sync-meta-balance-15m',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-balance',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
