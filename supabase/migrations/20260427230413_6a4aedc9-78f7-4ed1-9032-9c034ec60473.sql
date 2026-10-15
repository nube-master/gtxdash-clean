INSERT INTO public.notification_templates (
  name, type, title_template, body_template, available_variables, is_active, is_system, project_scope
)
VALUES (
  'Guerra de Estruturas 03',
  'guerra_estruturas_03',
  '🎯 Guerra de Estruturas 03 — LL10% Hoje',
  E'🟣 LOOKALIKE 10%\n💰 Lucro: R$ {{lucro_ll10}}\n📈 ROAS: {{roas_ll10}}x\n💵 Receita: R$ {{receita_ll10}}\n🔥 Gasto: R$ {{gasto_ll10}}\n🛒 Vendas: {{vendas_ll10}}\n🎯 CPA: R$ {{cpa_ll10}}\n📊 Campanhas ativas: {{campanhas_ll10}}',
  ARRAY['lucro_ll10','roas_ll10','receita_ll10','gasto_ll10','vendas_ll10','cpa_ll10','campanhas_ll10'],
  true,
  false,
  'global'
);