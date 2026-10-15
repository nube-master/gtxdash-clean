ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS funnel_url text,
  ADD COLUMN IF NOT EXISTS extra_links jsonb NOT NULL DEFAULT '[]'::jsonb;