
ALTER TABLE public.pacing_budget_groups
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
