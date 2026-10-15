DELETE FROM public.traffic_data_hourly 
WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND date >= '2026-08-14' 
  AND date <= '2026-08-19';

DELETE FROM public.daily_totals_snapshot 
WHERE operation_id='8707b3f8-ab41-4a63-902c-9ab97fe50c8a' 
  AND date >= '2026-08-14';