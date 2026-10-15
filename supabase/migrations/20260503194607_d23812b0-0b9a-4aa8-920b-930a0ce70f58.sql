
CREATE TABLE public.offer_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  nicho offer_nicho NOT NULL,
  cpc_brl numeric,
  cpm_brl numeric,
  ctr_pct numeric,
  cpi_brl numeric,
  conversion_pct numeric,
  pitch_retention_pct numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (operation_id, nicho)
);

CREATE INDEX idx_offer_benchmarks_op_nicho ON public.offer_benchmarks(operation_id, nicho);

ALTER TABLE public.offer_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view benchmarks of their operation"
  ON public.offer_benchmarks FOR SELECT
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "Admins can insert benchmarks"
  ON public.offer_benchmarks FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE user_id = auth.uid()
        AND operation_id = offer_benchmarks.operation_id
        AND role IN ('owner', 'admin')
        AND COALESCE(status, 'active') = 'active'
    )
  );

CREATE POLICY "Admins can update benchmarks"
  ON public.offer_benchmarks FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE user_id = auth.uid()
        AND operation_id = offer_benchmarks.operation_id
        AND role IN ('owner', 'admin')
        AND COALESCE(status, 'active') = 'active'
    )
  );

CREATE POLICY "Admins can delete benchmarks"
  ON public.offer_benchmarks FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members
      WHERE user_id = auth.uid()
        AND operation_id = offer_benchmarks.operation_id
        AND role IN ('owner', 'admin')
        AND COALESCE(status, 'active') = 'active'
    )
  );

CREATE TRIGGER update_offer_benchmarks_updated_at
  BEFORE UPDATE ON public.offer_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Diabetes benchmark for primary operation
INSERT INTO public.offer_benchmarks (operation_id, nicho, cpc_brl, cpm_brl, ctr_pct, cpi_brl, conversion_pct, pitch_retention_pct, notes)
SELECT id, 'blood_sugar_glp1'::offer_nicho, 6.57, 242.99, 3.64, 259.84, 1.40, 11.26, 'Benchmark padrão Diabetes'
FROM public.operations
WHERE status = 'active'
ON CONFLICT (operation_id, nicho) DO NOTHING;
