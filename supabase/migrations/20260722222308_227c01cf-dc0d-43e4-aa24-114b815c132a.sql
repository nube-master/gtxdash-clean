
-- Clona todos os templates da operação GTX para ESCOLA DO DÓLAR.
-- Clones entram DESATIVADOS (is_active=false) e não-sistema (is_system=false),
-- pra Gabriel revisar/apagar/ativar sem risco.
-- Idempotente: só insere se ainda não existir template com mesmo (name, type) na op destino.

WITH src AS (
  SELECT name, type, title_template, body_template, available_variables, project_scope
  FROM public.notification_templates
  WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d'
)
INSERT INTO public.notification_templates
  (name, type, title_template, body_template, available_variables,
   is_active, is_system, project_scope, operation_id)
SELECT
  src.name,
  src.type,
  src.title_template,
  src.body_template,
  src.available_variables,
  false,                       -- desativado por padrão
  false,                       -- não é system na op destino
  COALESCE(src.project_scope, 'TODOS'),
  '1dd606e3-dac2-4064-b863-9784307c9e98'::uuid
FROM src
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates dst
  WHERE dst.operation_id = '1dd606e3-dac2-4064-b863-9784307c9e98'::uuid
    AND dst.name = src.name
    AND dst.type = src.type
);
