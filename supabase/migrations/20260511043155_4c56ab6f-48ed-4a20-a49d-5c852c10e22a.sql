ALTER TABLE public.live_viewers ADD COLUMN IF NOT EXISTS product_slug TEXT;
CREATE INDEX IF NOT EXISTS live_viewers_product_slug_lastseen ON public.live_viewers (product_slug, last_seen_at DESC);
ALTER TABLE public.live_events ADD COLUMN IF NOT EXISTS product_slug TEXT;