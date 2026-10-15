
-- Table for manual traffic spend adjustments (lost accounts, etc.)
CREATE TABLE public.manual_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_adjustments ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Allow authenticated read manual_adjustments"
  ON public.manual_adjustments FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated insert manual_adjustments"
  ON public.manual_adjustments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update manual_adjustments"
  ON public.manual_adjustments FOR UPDATE
  USING (true);

CREATE POLICY "Allow authenticated delete manual_adjustments"
  ON public.manual_adjustments FOR DELETE
  USING (true);

-- Auto-update timestamp
CREATE TRIGGER update_manual_adjustments_updated_at
  BEFORE UPDATE ON public.manual_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
