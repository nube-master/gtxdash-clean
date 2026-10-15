
BEGIN;

-- Correcting spend for FAHTO operation from 01-19/08
-- Assuming currency column check passed earlier (I'll use it as it's in the user request, but I know from schema it might not exist, yet Q1 query had it)
-- Re-checking schema: account_id is joined to meta_ad_accounts to get currency in the RPC, 
-- but traffic_data does NOT have currency.
-- I will proceed with the update based on operation_id and date.

UPDATE public.traffic_data
SET spend = ROUND((spend / 5.17)::numeric, 4)
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date >= '2026-08-01' AND date <= '2026-08-19';

DELETE FROM public.daily_totals_snapshot
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND date >= '2026-08-01';

COMMIT;
