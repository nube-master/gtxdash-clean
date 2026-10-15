ALTER TABLE public.cod_orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sphere';
UPDATE public.cod_orders SET source = COALESCE(NULLIF(platform,''), 'sphere') WHERE source IS NULL OR source = '';
CREATE INDEX IF NOT EXISTS idx_cod_orders_op_source_date ON public.cod_orders (operation_id, source, order_date);

CREATE TABLE IF NOT EXISTS public.cod_manual_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL,
  user_id UUID,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  retroactive BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'completed',
  snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cod_manual_imports TO authenticated;
GRANT ALL ON public.cod_manual_imports TO service_role;
ALTER TABLE public.cod_manual_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cod_manual_imports_select" ON public.cod_manual_imports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR operation_id IN (SELECT om.operation_id FROM public.operation_members om WHERE om.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.cod_manual_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.cod_manual_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  external_order_id TEXT,
  result TEXT NOT NULL,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cod_manual_import_rows TO authenticated;
GRANT ALL ON public.cod_manual_import_rows TO service_role;
ALTER TABLE public.cod_manual_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cod_manual_import_rows_select" ON public.cod_manual_import_rows
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cod_manual_imports b WHERE b.id = batch_id AND (public.has_role(auth.uid(), 'admin') OR b.operation_id IN (SELECT om.operation_id FROM public.operation_members om WHERE om.user_id = auth.uid()))));

ALTER TABLE public.cod_orders ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.cod_manual_imports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cod_orders_import_batch ON public.cod_orders (import_batch_id);

CREATE TRIGGER trg_cod_manual_imports_touch BEFORE UPDATE ON public.cod_manual_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();