BEGIN;
-- Limpa dados horários imprecisos
DELETE FROM traffic_data_hourly
WHERE operation_id IN (
  '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', -- FAHTO
  '0b758a2b-1b92-4769-b47b-416c567e320d', -- GTX
  '1dd606e3-dac2-4064-b863-9784307c9e98'  -- EDD
)
  AND date >= '2026-08-01' 
  AND date <= '2026-08-21';

-- Invalida snapshots para forçar recálculo total
DELETE FROM daily_totals_snapshot
WHERE operation_id IN (
  '8707b3f8-ab41-4a63-902c-9ab97fe50c8a',
  '0b758a2b-1b92-4769-b47b-416c567e320d',
  '1dd606e3-dac2-4064-b863-9784307c9e98'
)
  AND date >= '2026-08-01';
COMMIT;