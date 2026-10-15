CREATE TABLE public.operation_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_input text NOT NULL,
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX operation_aliases_alias_key ON public.operation_aliases (lower(alias_input));
CREATE INDEX operation_aliases_operation_idx ON public.operation_aliases (operation_id);

GRANT SELECT ON public.operation_aliases TO authenticated;
GRANT ALL ON public.operation_aliases TO service_role;

ALTER TABLE public.operation_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read operation aliases"
ON public.operation_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins manage operation aliases"
ON public.operation_aliases FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

CREATE TRIGGER update_operation_aliases_updated_at
BEFORE UPDATE ON public.operation_aliases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.operation_aliases (alias_input, operation_id)
SELECT a.alias, o.id
FROM (VALUES
  ('FAHTO', 'fahto-media'),
  ('fahto', 'fahto-media'),
  ('fahto-media', 'fahto-media'),
  ('fahto media', 'fahto-media'),
  ('GTX', 'gtx-midia'),
  ('gtx', 'gtx-midia'),
  ('gtx-media', 'gtx-midia'),
  ('gtx-midia', 'gtx-midia'),
  ('EDD', 'escola-do-dolar'),
  ('edd', 'escola-do-dolar'),
  ('escola-do-dolar', 'escola-do-dolar'),
  ('escola do dolar', 'escola-do-dolar'),
  ('SPACE', 'space-ads'),
  ('space', 'space-ads'),
  ('space-ads', 'space-ads'),
  ('space-media', 'space-ads'),
  ('ESCALIFY', 'escalify'),
  ('escalify', 'escalify')
) AS a(alias, slug)
JOIN public.operations o ON o.slug = a.slug
ON CONFLICT DO NOTHING;