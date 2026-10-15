
-- Create academy-videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('academy-videos', 'academy-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read videos
CREATE POLICY "Authenticated can read academy videos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'academy-videos');

-- Allow admins to upload videos
CREATE POLICY "Admins can upload academy videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'academy-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow admins to delete videos
CREATE POLICY "Admins can delete academy videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'academy-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
