CREATE TABLE public.spy_manual_ad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  advertiser_id uuid NOT NULL REFERENCES public.spy_advertiser(id) ON DELETE CASCADE,
  library_url text NOT NULL,
  meta_ad_id text,
  ad_copy text,
  ad_title text,
  ad_cta text,
  ad_landing_url text,
  media_type text,
  media_url text,
  thumbnail_url text,
  ai_analysis jsonb,
  ai_analyzed_at timestamptz,
  notes text,
  tags text[] DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_spy_manual_ad_advertiser ON public.spy_manual_ad(advertiser_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_spy_manual_ad_operation ON public.spy_manual_ad(operation_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_spy_manual_ad_unique_url ON public.spy_manual_ad(advertiser_id, library_url) WHERE deleted_at IS NULL;

ALTER TABLE public.spy_manual_ad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Spy manual ads SELECT by op members"
  ON public.spy_manual_ad FOR SELECT
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "Spy manual ads INSERT by op members"
  ON public.spy_manual_ad FOR INSERT
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "Spy manual ads UPDATE by op members"
  ON public.spy_manual_ad FOR UPDATE
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE POLICY "Spy manual ads DELETE by op members"
  ON public.spy_manual_ad FOR DELETE
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE TRIGGER spy_manual_ad_updated
  BEFORE UPDATE ON public.spy_manual_ad
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();