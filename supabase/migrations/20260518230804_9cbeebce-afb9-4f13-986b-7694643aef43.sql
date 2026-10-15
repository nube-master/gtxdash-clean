
CREATE TABLE IF NOT EXISTS public.spy_offer_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.spy_offers(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  folder text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spy_offer_files_offer ON public.spy_offer_files(offer_id, folder, created_at DESC);

ALTER TABLE public.spy_offer_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spy_offer_files tenant all"
ON public.spy_offer_files FOR ALL TO authenticated
USING (public.spy_offer_in_my_operation(offer_id))
WITH CHECK (public.spy_offer_in_my_operation(offer_id));

INSERT INTO storage.buckets (id, name, public)
VALUES ('spy-offer-files', 'spy-offer-files', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: <offer_id>/<folder>/<uuid>-<filename>
CREATE POLICY "spy files read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'spy-offer-files'
  AND public.spy_offer_in_my_operation(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "spy files upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'spy-offer-files'
  AND public.spy_offer_in_my_operation(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "spy files delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'spy-offer-files'
  AND public.spy_offer_in_my_operation(((storage.foldername(name))[1])::uuid)
);
