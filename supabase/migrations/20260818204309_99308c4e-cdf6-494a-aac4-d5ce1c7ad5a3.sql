-- Idempotência para polling RedTrack (FAHTO)
ALTER TABLE public.redtrack_conversions ADD COLUMN IF NOT EXISTS rt_id text;
UPDATE public.redtrack_conversions SET rt_id = COALESCE(rt_id, external_id, clickid) WHERE rt_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS redtrack_conversions_op_rtid_uidx
  ON public.redtrack_conversions (operation_id, rt_id) WHERE rt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS redtrack_conversions_op_convtime_idx
  ON public.redtrack_conversions (operation_id, conv_time DESC);