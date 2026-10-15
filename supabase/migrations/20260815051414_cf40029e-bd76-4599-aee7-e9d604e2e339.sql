ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS vturb_api_key TEXT;
GRANT SELECT, UPDATE(vturb_api_key) ON public.operations TO authenticated;
GRANT ALL ON public.operations TO service_role;