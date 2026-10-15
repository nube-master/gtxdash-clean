ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS comissao_usd numeric,
  ADD COLUMN IF NOT EXISTS media_channels text[];