UPDATE public.notification_templates
SET title_template = '{{alerta}}' || REPLACE(title_template, 'FATHO', 'FAHTO') || ' {{prejuizo}}',
    body_template = '{{frase}}
Vendas: {{vendas}} · Fat: R$ {{faturamento}}
Lucro: R$ {{lucro}} · ROAS: {{roas}}x
{{resultado}}'
WHERE type = 'status_operacao' AND is_active = true;

UPDATE public.notification_templates
SET title_template = REPLACE(title_template, 'FATHO', 'FAHTO')
WHERE title_template LIKE '%FATHO%';