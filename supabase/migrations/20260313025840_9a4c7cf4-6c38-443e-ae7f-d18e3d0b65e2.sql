SELECT cron.schedule(
  'notify-creative-scale-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/notify-creative-scale',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );$$
);