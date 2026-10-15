ALTER TABLE public.spy_offers DROP CONSTRAINT IF EXISTS spy_offers_trafego_check;
ALTER TABLE public.spy_offers ADD CONSTRAINT spy_offers_trafego_check
  CHECK (trafego IS NULL OR trafego = ANY (ARRAY['Facebook','Instagram','Google','TikTok','YouTube','Native Ads','Black','White','Gray','Unknown']));