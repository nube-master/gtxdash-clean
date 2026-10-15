ALTER TABLE public.redtrack_conversions ADD COLUMN IF NOT EXISTS track_time timestamptz;
UPDATE public.redtrack_conversions
SET track_time = NULLIF(raw_payload->>'track_time','')::timestamptz
WHERE track_time IS NULL AND raw_payload ? 'track_time';
CREATE INDEX IF NOT EXISTS idx_rt_conv_op_track_time ON public.redtrack_conversions (operation_id, track_time DESC);