INSERT INTO storage.buckets (id, name, public) VALUES ('operation-logos', 'operation-logos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read operation logos" ON storage.objects FOR SELECT USING (bucket_id = 'operation-logos');
CREATE POLICY "Authenticated can upload operation logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'operation-logos');
CREATE POLICY "Authenticated can update operation logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'operation-logos');
CREATE POLICY "Authenticated can delete operation logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'operation-logos');