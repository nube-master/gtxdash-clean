UPDATE public.notification_templates
SET title_template = 'Venda aprovada! | {{utm_campaign}}',
    body_template = 'Valor: {{fx_tilde}}${{valor_usd}}{{fx_note}}',
    use_legacy = false
WHERE type = 'sale_approved';

-- Um único template ativo por operação
UPDATE public.notification_templates SET is_active = false WHERE type = 'sale_approved';

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY operation_id
    ORDER BY (name = 'Venda Aprovada!') DESC, (name ILIKE 'Venda Aprovada!%') DESC, created_at
  ) AS rn
  FROM public.notification_templates
  WHERE type = 'sale_approved'
)
UPDATE public.notification_templates t
SET is_active = true
FROM ranked r
WHERE t.id = r.id AND r.rn = 1;

INSERT INTO public.notification_templates (name, type, operation_id, title_template, body_template, is_active, use_legacy, project_scope, available_variables)
SELECT 'Venda Aprovada!', 'sale_approved', o.id,
       'Venda aprovada! | {{utm_campaign}}',
       'Valor: {{fx_tilde}}${{valor_usd}}{{fx_note}}',
       true, false, 'TODOS',
       ARRAY['utm_campaign','valor_usd','op_name']
FROM public.operations o
WHERE o.slug = 'escalify'
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_templates t
    WHERE t.type = 'sale_approved' AND t.operation_id = o.id
  );