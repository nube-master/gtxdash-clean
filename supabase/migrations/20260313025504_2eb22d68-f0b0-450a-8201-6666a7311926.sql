INSERT INTO notification_templates (type, name, title_template, body_template, is_active, is_system, available_variables, project_scope)
VALUES (
  'creative_scale_alert',
  'Criativo Pedindo Pré Escala',
  'CRIATIVO PEDINDO PRÉ ESCALA! 🔥',
  '🔥 {{criativo_nome}}
ROI {{roi}} | {{vendas}} vendas
Pronto para subir para pré-escala.',
  true,
  false,
  ARRAY['criativo_nome', 'roi', 'vendas'],
  'all'
)
ON CONFLICT DO NOTHING;