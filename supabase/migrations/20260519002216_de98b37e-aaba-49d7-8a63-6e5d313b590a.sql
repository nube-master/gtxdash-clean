DROP POLICY IF EXISTS spy_covers_admin_insert ON storage.objects;
DROP POLICY IF EXISTS spy_covers_admin_update ON storage.objects;
DROP POLICY IF EXISTS spy_covers_admin_delete ON storage.objects;

CREATE POLICY spy_covers_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'spy-offer-covers');

CREATE POLICY spy_covers_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'spy-offer-covers')
  WITH CHECK (bucket_id = 'spy-offer-covers');

CREATE POLICY spy_covers_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'spy-offer-covers');