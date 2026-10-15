-- 1) Colunas em offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS sales_page_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_image_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_image_updated_at TIMESTAMPTZ;

-- 2) Bucket público para previews
INSERT INTO storage.buckets (id, name, public)
VALUES ('offer-previews', 'offer-previews', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3) Políticas
DROP POLICY IF EXISTS "offer-previews public read" ON storage.objects;
CREATE POLICY "offer-previews public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'offer-previews');

DROP POLICY IF EXISTS "offer-previews auth insert" ON storage.objects;
CREATE POLICY "offer-previews auth insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'offer-previews');

DROP POLICY IF EXISTS "offer-previews auth update" ON storage.objects;
CREATE POLICY "offer-previews auth update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'offer-previews');

DROP POLICY IF EXISTS "offer-previews auth delete" ON storage.objects;
CREATE POLICY "offer-previews auth delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'offer-previews');