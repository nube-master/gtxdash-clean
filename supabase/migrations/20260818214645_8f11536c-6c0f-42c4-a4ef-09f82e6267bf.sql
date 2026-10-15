UPDATE public.redtrack_conversions
SET payout_brl = ROUND((payout * 5.21)::numeric, 2)
WHERE operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a'
  AND payout IS NOT NULL;