
-- Create academy_lesson_attachments table
CREATE TABLE public.academy_lesson_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.academy_lesson_attachments ENABLE ROW LEVEL SECURITY;

-- Authenticated can read
CREATE POLICY "Authenticated can read attachments"
ON public.academy_lesson_attachments FOR SELECT
TO authenticated
USING (true);

-- Admins can insert
CREATE POLICY "Admins can insert attachments"
ON public.academy_lesson_attachments FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can delete
CREATE POLICY "Admins can delete attachments"
ON public.academy_lesson_attachments FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Create academy-attachments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('academy-attachments', 'academy-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read attachments
CREATE POLICY "Authenticated can read academy attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'academy-attachments');

-- Allow admins to upload attachments
CREATE POLICY "Admins can upload academy attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'academy-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow admins to delete attachments
CREATE POLICY "Admins can delete academy attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'academy-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
