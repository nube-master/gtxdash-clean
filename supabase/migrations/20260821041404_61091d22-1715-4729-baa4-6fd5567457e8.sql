
BEGIN;

UPDATE public.traffic_data
SET spend = ROUND((spend / 5.17)::numeric, 4)
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date = '2026-08-20';

DELETE FROM public.daily_totals_snapshot
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date = '2026-08-20';

COMMIT;
