ALTER TABLE public.spy_advertiser
  ADD COLUMN IF NOT EXISTS meta_page_id text,
  ADD COLUMN IF NOT EXISTS meta_search_term text;

COMMENT ON COLUMN public.spy_advertiser.meta_page_id IS 'Page ID da Meta (preferencial). Se preenchido, usa search_page_ids no ads_archive.';
COMMENT ON COLUMN public.spy_advertiser.meta_search_term IS 'Termo de busca livre (fallback). Usado em search_terms quando não há page_id.';

CREATE TABLE IF NOT EXISTS public.spy_creative (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  advertiser_id uuid NOT NULL REFERENCES public.spy_advertiser(id) ON DELETE CASCADE,
  meta_ad_archive_id text NOT NULL,
  ad_creative_body text,
  ad_creative_link_title text,
  ad_creative_link_description text,
  ad_snapshot_url text,
  media_type text,
  media_url text,
  storage_path text,
  transcript text,
  transcript_generated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (advertiser_id, meta_ad_archive_id)
);

CREATE INDEX IF NOT EXISTS idx_spy_creative_operation ON public.spy_creative(operation_id);
CREATE INDEX IF NOT EXISTS idx_spy_creative_advertiser ON public.spy_creative(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_spy_creative_active ON public.spy_creative(advertiser_id, is_active);

ALTER TABLE public.spy_creative ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spy_creative_select" ON public.spy_creative FOR SELECT TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_creative_insert" ON public.spy_creative FOR INSERT TO authenticated
  WITH CHECK (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_creative_update" ON public.spy_creative FOR UPDATE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));
CREATE POLICY "spy_creative_delete" ON public.spy_creative FOR DELETE TO authenticated
  USING (public.spy_user_in_operation(auth.uid(), operation_id));

CREATE TRIGGER spy_creative_updated_at
  BEFORE UPDATE ON public.spy_creative
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('spy-creatives', 'spy-creatives', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "spy_creatives_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'spy-creatives'
    AND public.spy_user_in_operation(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "spy_creatives_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'spy-creatives'
    AND public.spy_user_in_operation(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "spy_creatives_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'spy-creatives'
    AND public.spy_user_in_operation(auth.uid(), (storage.foldername(name))[1]::uuid)
  );