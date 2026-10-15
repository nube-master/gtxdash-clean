ALTER TABLE public.cod_orders 
ADD COLUMN IF NOT EXISTS buyer_email TEXT,
ADD COLUMN IF NOT EXISTS product_name TEXT;

CREATE TABLE IF NOT EXISTS public.affiliate_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nickname TEXT UNIQUE NOT NULL,
    operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE,
    platform TEXT DEFAULT 'shphere',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_mappings TO authenticated;
GRANT ALL ON public.affiliate_mappings TO service_role;

INSERT INTO public.affiliate_mappings (nickname, operation_id, platform)
VALUES ('guilhermepirespadilha', '8707b3f8-ab41-4a63-902c-9ab97fe50c8a', 'shphere')
ON CONFLICT (nickname) DO UPDATE SET operation_id = EXCLUDED.operation_id;

ALTER TABLE public.affiliate_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for authenticated" ON public.affiliate_mappings FOR SELECT TO authenticated USING (true);