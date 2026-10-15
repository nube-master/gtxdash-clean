CREATE TABLE IF NOT EXISTS public.system_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  operation_id uuid REFERENCES public.operations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_docs TO authenticated;
GRANT ALL ON public.system_docs TO service_role;

ALTER TABLE public.system_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_docs_read" ON public.system_docs FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_docs_write" ON public.system_docs FOR ALL TO authenticated USING (true) WITH CHECK (true);