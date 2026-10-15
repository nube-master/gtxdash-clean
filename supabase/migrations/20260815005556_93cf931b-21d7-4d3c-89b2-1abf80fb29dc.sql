
-- 1. Backup
CREATE TABLE IF NOT EXISTS public.traffic_data_backup_20260815 AS SELECT * FROM public.traffic_data;

-- 2. Deduplicate
WITH ranked AS (
  SELECT ctid, ROW_NUMBER() OVER (PARTITION BY account_id, date ORDER BY created_at DESC) as rn
  FROM public.traffic_data
)
DELETE FROM public.traffic_data WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- 3. Unique Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_traffic_data_unique ON public.traffic_data (account_id, date);
