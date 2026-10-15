
ALTER TABLE public.clickbank_audit
  ADD COLUMN IF NOT EXISTS meta_campaign_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS aff_sub2 text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS aff_sub3 text DEFAULT NULL;

COMMENT ON COLUMN public.clickbank_audit.meta_campaign_id IS 'Campaign ID extracted from aff_sub2/aff_sub3, used for attribution double-check';
