ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS vsl_intel_summary jsonb,
  ADD COLUMN IF NOT EXISTS vsl_intel_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vsl_intel_source_files jsonb;