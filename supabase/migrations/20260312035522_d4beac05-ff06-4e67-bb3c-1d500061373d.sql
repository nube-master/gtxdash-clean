
ALTER TABLE public.fixed_costs
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'outros',
  ADD COLUMN IF NOT EXISTS sector text NOT NULL DEFAULT 'empresa',
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'mensal';
