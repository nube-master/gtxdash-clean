
ALTER TABLE public.pacing_action_log DROP CONSTRAINT IF EXISTS pacing_action_log_action_type_check;
ALTER TABLE public.pacing_action_log ADD CONSTRAINT pacing_action_log_action_type_check
  CHECK (action_type = ANY (ARRAY['pause','resume','alert','reduce_budget','increase_budget','activate','snooze']));
