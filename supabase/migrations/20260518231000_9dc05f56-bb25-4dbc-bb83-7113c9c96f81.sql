
ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS funnel_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS checkout_urls text[] NOT NULL DEFAULT '{}';

UPDATE public.spy_offers
SET funnel_urls = ARRAY[funnel_url]
WHERE funnel_url IS NOT NULL AND funnel_url <> '' AND (funnel_urls IS NULL OR array_length(funnel_urls,1) IS NULL);

UPDATE public.spy_offers
SET checkout_urls = ARRAY[checkout_url]
WHERE checkout_url IS NOT NULL AND checkout_url <> '' AND (checkout_urls IS NULL OR array_length(checkout_urls,1) IS NULL);
