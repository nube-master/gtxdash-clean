-- Backfill project_slug for FAHTO 22/08 sales
UPDATE public.sales_data
SET project_slug = '[WL-COD-PL]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date = '2026-08-22'
  AND utm_campaign ILIKE '%[WL]%[PL]%'
  AND (project_slug IS NULL OR project_slug = 'OUTROS' OR project_slug = '[META]');

UPDATE public.sales_data
SET project_slug = '[ED-COD-PL]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date = '2026-08-22'
  AND utm_campaign ILIKE '%[ED]%[PL]%'
  AND (project_slug IS NULL OR project_slug = 'OUTROS' OR project_slug = '[META]');

UPDATE public.sales_data
SET project_slug = '[ED-COD-ROM]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date = '2026-08-22'
  AND utm_campaign ILIKE '%[ED]%[ROM]%'
  AND (project_slug IS NULL OR project_slug = 'OUTROS' OR project_slug = '[META]');

UPDATE public.sales_data
SET project_slug = '[WL-COD-ROM]'
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date = '2026-08-22'
  AND utm_campaign ILIKE '%[WL]%[ROM]%'
  AND (project_slug IS NULL OR project_slug = 'OUTROS' OR project_slug = '[META]');
