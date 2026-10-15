UPDATE public.notification_templates
SET 
  title_template = '🎯 Guerra de Estruturas 03 — LL10% (hoje)',
  body_template = E'🎯 LOOKALIKE 10%\n💰 Lucro: R$ {{lucro_ll10}}\n📈 ROAS: {{roas_ll10}}x\n💵 Receita: R$ {{receita_ll10}}\n🔥 Gasto: R$ {{gasto_ll10}}'
WHERE type = 'guerra_estruturas_03';