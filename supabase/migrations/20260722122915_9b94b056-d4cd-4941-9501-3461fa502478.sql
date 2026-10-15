insert into notification_templates (name, type, title_template, body_template, available_variables, is_active, is_system, project_scope, operation_id)
values (
  'Venda Aprovada MGID!',
  'sale_approved',
  'Venda aprovada MGID! | {{projeto}} 🌐',
  E'Comissão: R$ {{valor}}\n{{utm_resumo}}',
  ARRAY['utm_campaign','utm_resumo','valor','produto','projeto','store']::text[],
  true,
  false,
  'TODOS',
  '0b758a2b-1b92-4769-b47b-416c567e320d'
);