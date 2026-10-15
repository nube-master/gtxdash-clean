BEGIN;
DELETE FROM public.traffic_data 
WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND date='2026-08-19';
UPDATE public.traffic_data
SET date = '2026-08-19'
WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND date='2026-08-20';
DELETE FROM public.daily_totals_snapshot
WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND date IN ('2026-08-19', '2026-08-20');
COMMIT;

-- Validation
SELECT date, count(*), sum(spend) 
FROM public.traffic_data 
WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND date IN ('2026-08-19', '2026-08-20')
GROUP BY date;