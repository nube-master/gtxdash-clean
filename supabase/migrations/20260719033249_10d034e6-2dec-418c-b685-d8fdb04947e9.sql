
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS is_cod BOOLEAN NOT NULL DEFAULT false;

-- Marca como COD todas as ofertas que hoje são COD (padrão XX-COD, RRT-COD com espaços, e a família VIT-RRT)
UPDATE public.offers
   SET is_cod = true
 WHERE apelido_interno ~* '(^|[^A-Z0-9_])[A-Z0-9]+\s*-\s*COD(\s*-\s*[A-Z0-9]+)?([^A-Z0-9_]|$)'
    OR apelido_interno ILIKE 'VIT-RRT%';

CREATE INDEX IF NOT EXISTS idx_offers_is_cod ON public.offers(is_cod) WHERE is_cod = true;
