ALTER TABLE public.redtrack_conversions ADD COLUMN IF NOT EXISTS payout_brl NUMERIC(10,2);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redtrack_conversions TO authenticated;
GRANT ALL ON public.redtrack_conversions TO service_role;

UPDATE public.redtrack_conversions
SET payout_brl = payout * 5.5
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND payout_brl IS NULL;