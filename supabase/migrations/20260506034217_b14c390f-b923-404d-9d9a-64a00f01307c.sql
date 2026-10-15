CREATE TABLE IF NOT EXISTS public.producers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.producers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view producers" ON public.producers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert producers" ON public.producers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update producers" ON public.producers FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete producers" ON public.producers FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS producer_id uuid REFERENCES public.producers(id) ON DELETE SET NULL;

INSERT INTO public.producers (name) VALUES
  ('XMX'), ('Saraiva'), ('Yes (Instituto)'), ('BH'), ('Direct Meds Medics')
ON CONFLICT (name) DO NOTHING;