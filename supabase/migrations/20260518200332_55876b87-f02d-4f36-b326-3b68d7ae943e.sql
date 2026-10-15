-- ============================================
-- DROP Sprint 1
-- ============================================
DROP TABLE IF EXISTS public.spy_alert CASCADE;
DROP TABLE IF EXISTS public.spy_advertiser_history CASCADE;
DROP TABLE IF EXISTS public.spy_creative CASCADE;
DROP TABLE IF EXISTS public.spy_swipe CASCADE;
DROP TABLE IF EXISTS public.spy_manual_ad CASCADE;
DROP TABLE IF EXISTS public.spy_advertiser CASCADE;
DROP TABLE IF EXISTS public.spy_project CASCADE;
DROP FUNCTION IF EXISTS public.spy_user_in_operation(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.spy_user_in_operation(uuid) CASCADE;

-- ============================================
-- spy_offers
-- ============================================
CREATE TABLE public.spy_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL,
  offer_name TEXT NOT NULL,
  product_name TEXT,
  domain TEXT,
  primary_advertiser TEXT,
  primary_advertiser_page_id TEXT,
  hero_creative_url TEXT,
  hero_thumbnail_url TEXT,
  category_tab TEXT NOT NULL DEFAULT 'inicio'
    CHECK (category_tab IN ('inicio','white','upsell','lives','copywriters','spy')),
  nicho TEXT,
  subnicho TEXT,
  idioma TEXT,
  geo_main TEXT,
  trafego TEXT NOT NULL DEFAULT 'Unknown'
    CHECK (trafego IN ('Black','White','Gray','Unknown')),
  atributos TEXT[] NOT NULL DEFAULT '{}',
  active_ads_count INTEGER NOT NULL DEFAULT 0,
  total_ads_count INTEGER NOT NULL DEFAULT 0,
  advertiser_count INTEGER NOT NULL DEFAULT 0,
  days_running_max INTEGER,
  status TEXT NOT NULL DEFAULT 'qualified'
    CHECK (status IN ('hot','qualified','watching','dismissed')),
  escalando BOOLEAN NOT NULL DEFAULT false,
  score INTEGER,
  fit_gtx TEXT,
  cloaker_detected BOOLEAN NOT NULL DEFAULT false,
  payout_estimated_usd NUMERIC,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('apify','manual','enzo','notion')),
  source_meta JSONB,
  notion_id TEXT,
  notes TEXT,
  saved_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spy_offers_op ON public.spy_offers(operation_id);
CREATE INDEX idx_spy_offers_category ON public.spy_offers(category_tab);
CREATE INDEX idx_spy_offers_nicho ON public.spy_offers(nicho);
CREATE INDEX idx_spy_offers_trafego ON public.spy_offers(trafego);
CREATE INDEX idx_spy_offers_idioma ON public.spy_offers(idioma);
CREATE INDEX idx_spy_offers_subnicho ON public.spy_offers(subnicho);
CREATE INDEX idx_spy_offers_escalando ON public.spy_offers(escalando) WHERE escalando = true;
CREATE INDEX idx_spy_offers_last_updated ON public.spy_offers(last_updated_at DESC);
CREATE INDEX idx_spy_offers_active_ads ON public.spy_offers(active_ads_count DESC);
CREATE INDEX idx_spy_offers_search ON public.spy_offers USING gin (
  to_tsvector('simple', coalesce(offer_name,'') || ' ' || coalesce(product_name,'') || ' ' || coalesce(primary_advertiser,''))
);

-- spy_ads
CREATE TABLE public.spy_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  meta_ad_id TEXT UNIQUE,
  advertiser_name TEXT,
  advertiser_page_id TEXT,
  creative_type TEXT CHECK (creative_type IN ('video','image','carousel')),
  creative_url TEXT,
  thumbnail_url TEXT,
  primary_text TEXT,
  headline TEXT,
  description TEXT,
  cta_text TEXT,
  destination_url TEXT,
  geo_targeting JSONB,
  platform JSONB,
  ad_active_status TEXT DEFAULT 'active' CHECK (ad_active_status IN ('active','inactive')),
  ad_creation_time TIMESTAMPTZ,
  ad_first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ad_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hook_classified TEXT,
  hook_text TEXT,
  ai_summary TEXT,
  copywriter_id UUID,
  copywriter_confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spy_ads_offer ON public.spy_ads(offer_id);
CREATE INDEX idx_spy_ads_active ON public.spy_ads(ad_active_status);
CREATE INDEX idx_spy_ads_copywriter ON public.spy_ads(copywriter_id);

-- spy_lps
CREATE TABLE public.spy_lps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  url_final TEXT,
  format TEXT CHECK (format IN ('VSL','Quiz','Longform','Advertorial','Live')),
  pitch_time_seconds INTEGER,
  headline TEXT,
  sub_headline TEXT,
  hook_main TEXT,
  cta_main TEXT,
  pixels_detected JSONB,
  screenshot_url TEXT,
  html_hash TEXT,
  is_upsell BOOLEAN NOT NULL DEFAULT false,
  parent_lp_id UUID REFERENCES public.spy_lps(id) ON DELETE SET NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spy_lps_offer ON public.spy_lps(offer_id);

-- spy_copywriters
CREATE TABLE public.spy_copywriters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  alias TEXT[],
  avatar_url TEXT,
  bio TEXT,
  signature_patterns JSONB,
  known_offers TEXT[],
  is_legendary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- spy_favorites
CREATE TABLE public.spy_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  offer_id UUID NOT NULL REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  favorited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, offer_id)
);
CREATE INDEX idx_spy_favorites_user ON public.spy_favorites(user_id);

-- spy_history
CREATE TABLE public.spy_history (
  id BIGSERIAL PRIMARY KEY,
  operation_id UUID NOT NULL,
  offer_id UUID NOT NULL REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_ads_count INTEGER,
  total_ads_count INTEGER,
  raw_snapshot JSONB
);
CREATE INDEX idx_spy_history_offer ON public.spy_history(offer_id, snapshot_at DESC);

-- spy_watchlist
CREATE TABLE public.spy_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('keyword','advertiser','domain')),
  value TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  fetch_frequency_hours INTEGER NOT NULL DEFAULT 6,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spy_watchlist_op ON public.spy_watchlist(operation_id);

-- spy_scrape_log
CREATE TABLE public.spy_scrape_log (
  id BIGSERIAL PRIMARY KEY,
  operation_id UUID,
  source TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ads_fetched INTEGER,
  offers_created INTEGER,
  offers_updated INTEGER,
  errors INTEGER,
  duration_ms INTEGER,
  apify_run_id TEXT
);

-- Helper: oferta pertence à operação do user?
CREATE OR REPLACE FUNCTION public.spy_offer_in_my_operation(_offer_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.spy_offers o
    JOIN public.operation_members m ON m.operation_id = o.operation_id
    WHERE o.id = _offer_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
$$;

-- RLS
ALTER TABLE public.spy_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_lps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_copywriters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_scrape_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spy_offers tenant select" ON public.spy_offers
  FOR SELECT USING (public.live_user_in_operation(operation_id));
CREATE POLICY "spy_offers tenant insert" ON public.spy_offers
  FOR INSERT WITH CHECK (public.live_user_in_operation(operation_id));
CREATE POLICY "spy_offers tenant update" ON public.spy_offers
  FOR UPDATE USING (public.live_user_in_operation(operation_id));
CREATE POLICY "spy_offers tenant delete" ON public.spy_offers
  FOR DELETE USING (public.live_user_in_operation(operation_id));

CREATE POLICY "spy_ads tenant all" ON public.spy_ads
  FOR ALL USING (public.spy_offer_in_my_operation(offer_id))
  WITH CHECK (public.spy_offer_in_my_operation(offer_id));

CREATE POLICY "spy_lps tenant all" ON public.spy_lps
  FOR ALL USING (public.spy_offer_in_my_operation(offer_id))
  WITH CHECK (public.spy_offer_in_my_operation(offer_id));

CREATE POLICY "spy_history tenant select" ON public.spy_history
  FOR SELECT USING (public.live_user_in_operation(operation_id));
CREATE POLICY "spy_history tenant insert" ON public.spy_history
  FOR INSERT WITH CHECK (public.live_user_in_operation(operation_id));

CREATE POLICY "spy_watchlist tenant all" ON public.spy_watchlist
  FOR ALL USING (public.live_user_in_operation(operation_id))
  WITH CHECK (public.live_user_in_operation(operation_id));

CREATE POLICY "spy_scrape_log tenant select" ON public.spy_scrape_log
  FOR SELECT USING (operation_id IS NULL OR public.live_user_in_operation(operation_id));

CREATE POLICY "spy_favorites own select" ON public.spy_favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "spy_favorites own insert" ON public.spy_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "spy_favorites own delete" ON public.spy_favorites
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "spy_copywriters read all auth" ON public.spy_copywriters
  FOR SELECT TO authenticated USING (true);

-- Trigger touch last_updated_at
CREATE OR REPLACE FUNCTION public.spy_offers_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.last_updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER spy_offers_touch_trg
BEFORE UPDATE ON public.spy_offers
FOR EACH ROW
EXECUTE FUNCTION public.spy_offers_touch();