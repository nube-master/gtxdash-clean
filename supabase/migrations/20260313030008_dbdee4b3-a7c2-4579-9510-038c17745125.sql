INSERT INTO notification_templates (type, name, title_template, body_template, is_active, is_system, available_variables, project_scope)
VALUES (
  'creative_scale_up_alert',
  'Criativo Pedindo Escala',
  'CRIATIVO PEDINDO ESCALA! 🚀',
  '🔥 {{criativo_nome}}
ROI {{roi}} • {{vendas}} vendas
Pronto para escalar.',
  true,
  false,
  ARRAY['criativo_nome', 'roi', 'vendas'],
  'all'
)
ON CONFLICT DO NOTHING;

-- Cron every 5 minutes (same as pre-scale alert)
SELECT cron.schedule(
  'notify-creative-scale-up-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://taeduxiandktefcwgspx.supabase.co/functions/v1/notify-creative-scale-up',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );$$
);