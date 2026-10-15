UPDATE public.sales_data 
SET project_slug = '[ED-COD-ROM]' 
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND utm_campaign ILIKE '%[ED]%' 
  AND utm_campaign ILIKE '%[BST]%' 
  AND utm_campaign ILIKE '%[ROM]%';

SELECT project_slug, COUNT(*) 
FROM public.sales_data 
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date 
GROUP BY project_slug;