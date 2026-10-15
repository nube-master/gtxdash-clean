ALTER TABLE public.pacing_rules
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz;

CREATE INDEX IF NOT EXISTS pacing_rules_last_evaluated_at_idx
  ON public.pacing_rules (last_evaluated_at);