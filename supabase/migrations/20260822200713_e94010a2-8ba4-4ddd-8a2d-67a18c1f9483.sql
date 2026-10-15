UPDATE public.traffic_data
SET project_slug = '[ED-COD-ROM]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND campaign_name ILIKE '%ED-COD-ROM%';

UPDATE public.traffic_data
SET project_slug = '[WL-COD-ROM]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND campaign_name ILIKE '%WL-COD-ROM%';

UPDATE public.traffic_data
SET project_slug = 'WL-COD-PL'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND campaign_name ILIKE '%WL-COD-PL%';

UPDATE public.traffic_data
SET project_slug = 'ED-COD-PL'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  AND campaign_name ILIKE '%ED-COD-PL%';

SELECT project_slug, SUM(spend) as total_spend, COUNT(*)
FROM public.traffic_data
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND created_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
GROUP BY project_slug;