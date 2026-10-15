
ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS ad_library_url text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_angles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_niche_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_spy_offers_sync ON public.spy_offers (last_synced_at)
  WHERE ad_library_url IS NOT NULL;
