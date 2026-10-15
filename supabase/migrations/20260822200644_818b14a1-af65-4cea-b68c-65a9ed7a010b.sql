ALTER TABLE public.traffic_data ADD COLUMN IF NOT EXISTS project_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_traffic_data_project_slug ON public.traffic_data(project_slug);
CREATE INDEX IF NOT EXISTS idx_traffic_data_op_date ON public.traffic_data(operation_id, created_at);

UPDATE public.traffic_data
SET project_slug = '[ED-COD-ROM]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND campaign_name ILIKE '%[ED]%'
  AND campaign_name ILIKE '%[BST]%'
  AND campaign_name ILIKE '%[ROM]%';

UPDATE public.traffic_data
SET project_slug = '[WL-COD-ROM]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND campaign_name ILIKE '%[WL]%'
  AND campaign_name ILIKE '%[ROM]%';

SELECT project_slug, SUM(spend) as total_spend
FROM public.traffic_data
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
GROUP BY project_slug;