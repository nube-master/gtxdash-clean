-- ON CONFLICT precisa de índice único total (não parcial)
DROP INDEX IF EXISTS public.redtrack_conversions_op_rtid_uidx;
UPDATE public.redtrack_conversions SET rt_id = COALESCE(rt_id, external_id, clickid, id::text) WHERE rt_id IS NULL;
ALTER TABLE public.redtrack_conversions ALTER COLUMN rt_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS redtrack_conversions_op_rtid_uidx
  ON public.redtrack_conversions (operation_id, rt_id);