
-- Create cashflow_adjustments table
CREATE TABLE public.cashflow_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'outro',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cashflow_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies (authenticated users)
CREATE POLICY "Authenticated can read cashflow_adjustments"
  ON public.cashflow_adjustments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert cashflow_adjustments"
  ON public.cashflow_adjustments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update cashflow_adjustments"
  ON public.cashflow_adjustments FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated can delete cashflow_adjustments"
  ON public.cashflow_adjustments FOR DELETE TO authenticated
  USING (true);
