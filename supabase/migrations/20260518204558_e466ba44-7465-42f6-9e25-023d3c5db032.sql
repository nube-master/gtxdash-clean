ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS briefing_md text,
  ADD COLUMN IF NOT EXISTS briefing_generated_at timestamptz;