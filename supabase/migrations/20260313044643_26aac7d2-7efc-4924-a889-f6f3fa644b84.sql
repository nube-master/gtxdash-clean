
-- Create storage bucket for academy covers
INSERT INTO storage.buckets (id, name, public) VALUES ('academy-covers', 'academy-covers', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload academy covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'academy-covers');

-- Allow public read
CREATE POLICY "Public can read academy covers"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'academy-covers');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can update academy covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'academy-covers');

CREATE POLICY "Authenticated users can delete academy covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'academy-covers');
