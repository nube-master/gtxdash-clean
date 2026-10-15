
ALTER TABLE public.pacing_action_log DROP CONSTRAINT IF EXISTS pacing_action_log_action_type_check;
ALTER TABLE public.pacing_action_log ADD CONSTRAINT pacing_action_log_action_type_check
  CHECK (action_type = ANY (ARRAY['pause','resume','alert','reduce_budget','increase_budget','activate','snooze','kill_squad']));
ALTER TABLE public.pacing_action_log ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.pacing_action_log ADD COLUMN IF NOT EXISTS killed_by uuid;
ALTER TABLE public.pacing_action_log ADD COLUMN IF NOT EXISTS region text;
CREATE INDEX IF NOT EXISTS idx_pacing_action_log_batch_id ON public.pacing_action_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_pacing_action_log_killed_by ON public.pacing_action_log(killed_by);
CREATE INDEX IF NOT EXISTS idx_pacing_action_log_region ON public.pacing_action_log(region);
