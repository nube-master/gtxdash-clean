CREATE POLICY "Anon can read operations for public pages"
ON public.operations
FOR SELECT
TO anon
USING (true);