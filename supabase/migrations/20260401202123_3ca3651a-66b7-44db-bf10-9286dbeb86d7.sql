
-- Fix traffic_data rows with NULL operation_id that belong to accounts with operation_id set
UPDATE traffic_data t
SET operation_id = a.operation_id
FROM meta_ad_accounts a
WHERE t.account_id = a.account_id
  AND a.operation_id IS NOT NULL
  AND t.operation_id IS NULL;
