-- Fix OP GERAL templates: corrige typo FATHO → FAHTO e popula body_template vazio

-- 1. Corrige typo em title_template
UPDATE notification_templates
SET title_template = REPLACE(title_template, 'FATHO', 'FAHTO'),
    updated_at = now()
WHERE title_template LIKE '%FATHO%';

-- 2. Popula body_template dos templates OP GERAL que estao vazios
UPDATE notification_templates
SET body_template = E'Vendas: {{vendas}} · Fat: R$ {{faturamento}} · Lucro: R$ {{lucro}} · ROAS: {{roas}}x',
    available_variables = ARRAY['vendas','faturamento','lucro','roas','operacao'],
    updated_at = now()
WHERE title_template ILIKE '%OP GERAL%'
  AND (body_template IS NULL OR body_template = '');

-- 3. Garante que o type dos templates OP GERAL seja 'op_geral' (padroniza)
UPDATE notification_templates
SET type = 'op_geral',
    updated_at = now()
WHERE title_template ILIKE '%OP GERAL%'
  AND type != 'op_geral';
