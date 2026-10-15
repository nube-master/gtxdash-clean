
ALTER TABLE public.clickbank_audit
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS sck text,
  ADD COLUMN IF NOT EXISTS xcod text,
  ADD COLUMN IF NOT EXISTS src text,
  ADD COLUMN IF NOT EXISTS raw_tracking jsonb;

CREATE INDEX IF NOT EXISTS idx_cb_audit_utm_campaign
  ON public.clickbank_audit (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cb_audit_sck
  ON public.clickbank_audit (sck)
  WHERE sck IS NOT NULL;
