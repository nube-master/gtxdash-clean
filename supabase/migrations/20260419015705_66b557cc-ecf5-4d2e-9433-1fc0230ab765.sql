INSERT INTO public.notification_templates (type, name, title_template, body_template, available_variables, is_system, is_active, project_scope)
VALUES (
  'guerra_fases',
  'Guerra de Fases (Teste / Pré-Escala / Escala)',
  '⚔️ Guerra de Fases — Hoje',
  'Comparativo entre TESTE (1-50-1), PRÉ-ESCALA (1-100-1) e ESCALA (1-250-1). Vencedor pelo maior lucro absoluto + diagnóstico de funil.',
  ARRAY['receita_teste','gasto_teste','lucro_teste','roas_teste','receita_pre','gasto_pre','lucro_pre','roas_pre','receita_escala','gasto_escala','lucro_escala','roas_escala','vencedor','diagnostico'],
  true,
  true,
  'TODOS'
)
ON CONFLICT DO NOTHING;