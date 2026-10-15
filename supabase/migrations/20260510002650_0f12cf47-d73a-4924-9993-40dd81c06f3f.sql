
-- 1. Remove versão anterior se existir e cadastra template Guerra de Estruturas 04
DELETE FROM public.notification_templates WHERE type = 'guerra_estruturas_04';

INSERT INTO public.notification_templates (
  name, type, title_template, body_template, available_variables, is_active, is_system, project_scope
)
VALUES (
  'Guerra de Estruturas 04',
  'guerra_estruturas_04',
  '🎯 Guerra de Estruturas 04 — CBO (hoje)',
  E'🟧 CBO\n💰 Lucro: R$ {{lucro_cbo}}\n📈 ROAS: {{roas_cbo}}x\n💵 Receita: R$ {{receita_cbo}}\n🔥 Gasto: R$ {{gasto_cbo}}\n🛒 IC: {{ic_cbo}}\n🎯 Custo por IC: R$ {{cpi_cbo}}',
  ARRAY['lucro_cbo','roas_cbo','receita_cbo','gasto_cbo','ic_cbo','cpi_cbo','campanhas_cbo','vendas_cbo'],
  true,
  false,
  'global'
);

-- 2. Agenda disparo diário 23:30 BRT (02:30 UTC) — mesmo horário das outras estruturas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-guerra-estruturas-04-2330') THEN
    PERFORM cron.unschedule('notify-guerra-estruturas-04-2330');
  END IF;
END $$;

SELECT cron.schedule(
  'notify-guerra-estruturas-04-2330',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://taeduxiandktefcwgspx.supabase.co/functions/v1/notify-guerra-estruturas-04',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_JWT"}'::jsonb,
    body:='{"time": "scheduled"}'::jsonb
  ) AS request_id;
  $$
);
