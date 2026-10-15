
-- Add profit goal and unit economics columns to planning_goals
ALTER TABLE public.planning_goals
  ADD COLUMN IF NOT EXISTS profit_goal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cogs numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate numeric NOT NULL DEFAULT 0;
