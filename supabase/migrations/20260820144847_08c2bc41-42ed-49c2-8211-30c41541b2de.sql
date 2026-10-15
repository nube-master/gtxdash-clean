-- First, deduplicate ALL operations to allow UNIQUE constraint creation
BEGIN;
WITH dupes AS (
  SELECT ctid, ROW_NUMBER() OVER (
    PARTITION BY operation_id, account_id, date
    ORDER BY updated_at DESC NULLS LAST
  ) AS rn
  FROM traffic_data
)
DELETE FROM traffic_data td
USING dupes d WHERE td.ctid = d.ctid AND d.rn > 1;
COMMIT;

-- Now add the constraint
ALTER TABLE traffic_data ADD CONSTRAINT traffic_data_op_acc_date_key UNIQUE (operation_id, account_id, date);

-- Phase 2.2: Update secret in app_settings (FAHTO)
UPDATE app_settings 
SET value = jsonb_build_object(
  'token', 'REDACTED_META_TOKEN',
  'app_id', '1591431779352420',
  'system_user_id', '122096907147432951'
)
WHERE key = 'meta_ads_access_token' AND operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a';