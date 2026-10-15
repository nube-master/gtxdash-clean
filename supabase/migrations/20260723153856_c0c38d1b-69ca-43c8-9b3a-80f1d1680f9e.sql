
ALTER TABLE public.clickbank_audit
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_placement TEXT,
  ADD COLUMN IF NOT EXISTS meta_campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_name TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_name TEXT;

CREATE INDEX IF NOT EXISTS idx_clickbank_audit_meta_campaign_id ON public.clickbank_audit(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clickbank_audit_meta_ad_id ON public.clickbank_audit(meta_ad_id) WHERE meta_ad_id IS NOT NULL;
