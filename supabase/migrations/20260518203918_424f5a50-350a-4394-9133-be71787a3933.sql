
CREATE TABLE IF NOT EXISTS public.spy_ad_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.spy_ads(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  hook_type TEXT,
  hook_text TEXT,
  angle TEXT,
  promise TEXT,
  pain_point TEXT,
  cta_style TEXT,
  emotional_trigger TEXT,
  target_audience TEXT,
  score_persuasao INTEGER CHECK (score_persuasao BETWEEN 0 AND 100),
  raw_analysis JSONB,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_id)
);

CREATE INDEX IF NOT EXISTS idx_spy_ad_insights_offer ON public.spy_ad_insights(offer_id);
CREATE INDEX IF NOT EXISTS idx_spy_ad_insights_operation ON public.spy_ad_insights(operation_id);
CREATE INDEX IF NOT EXISTS idx_spy_ad_insights_hook_type ON public.spy_ad_insights(hook_type);

ALTER TABLE public.spy_ad_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spy_ad_insights tenant select" ON public.spy_ad_insights
  FOR SELECT USING (live_user_in_operation(operation_id));

CREATE POLICY "spy_ad_insights service all" ON public.spy_ad_insights
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.spy_offers
  ADD COLUMN IF NOT EXISTS copy_intel_summary JSONB,
  ADD COLUMN IF NOT EXISTS copy_intel_analyzed_at TIMESTAMPTZ;
