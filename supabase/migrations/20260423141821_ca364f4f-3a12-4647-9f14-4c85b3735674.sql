ALTER TABLE public.creative_team_overrides 
  DROP CONSTRAINT IF EXISTS creative_team_overrides_unique;

ALTER TABLE public.creative_team_overrides 
  DROP COLUMN IF EXISTS campaign_id;

ALTER TABLE public.creative_team_overrides 
  ADD COLUMN campaign_name_pattern text;

ALTER TABLE public.creative_team_overrides 
  ADD CONSTRAINT creative_team_overrides_unique 
  UNIQUE (operation_id, creative_id, campaign_name_pattern);