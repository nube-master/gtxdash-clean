ALTER TABLE public.meta_campaign_status ADD COLUMN IF NOT EXISTS objective TEXT;
CREATE INDEX IF NOT EXISTS idx_meta_campaign_status_objective ON public.meta_campaign_status (operation_id, objective);