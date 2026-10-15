
-- Create storage bucket for custom toast logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('toast-logos', 'toast-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view toast logos (public bucket)
CREATE POLICY "Toast logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'toast-logos');

-- Allow authenticated users to upload toast logos
CREATE POLICY "Authenticated users can upload toast logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'toast-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their toast logos
CREATE POLICY "Authenticated users can update toast logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'toast-logos' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete toast logos
CREATE POLICY "Authenticated users can delete toast logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'toast-logos' AND auth.role() = 'authenticated');
