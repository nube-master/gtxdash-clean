-- Drop old unique constraint on date only
ALTER TABLE public.daily_totals_snapshot DROP CONSTRAINT IF EXISTS daily_totals_snapshot_date_key;

-- Create unique index that supports per-operation snapshots
-- COALESCE handles NULL operation_id for global snapshots
CREATE UNIQUE INDEX daily_totals_snapshot_date_op_key 
  ON public.daily_totals_snapshot (date, COALESCE(operation_id, '00000000-0000-0000-0000-000000000000'::uuid));