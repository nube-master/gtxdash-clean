ALTER TABLE public.clickbank_audit ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.sales_data ADD COLUMN IF NOT EXISTS country text;

CREATE INDEX IF NOT EXISTS idx_clickbank_audit_country ON public.clickbank_audit (operation_id, country, date);
CREATE INDEX IF NOT EXISTS idx_sales_data_country ON public.sales_data (operation_id, country, date);

COMMENT ON COLUMN public.clickbank_audit.country IS 'ISO-3166 alpha-2 do comprador/checkout (BR, US, PT...). Usado no Geo Lock de ofertas com país definido.';
COMMENT ON COLUMN public.sales_data.country IS 'ISO-3166 alpha-2 do comprador/checkout (BR, US, PT...). Espelho de clickbank_audit.country.';

-- Backfill: vendas Hotmart em BRL são compradores brasileiros
UPDATE public.clickbank_audit
   SET country = 'BR'
 WHERE vendor = 'hotmart'
   AND country IS NULL
   AND upper(coalesce(raw_tracking->>'gross_currency','')) = 'BRL';

UPDATE public.sales_data s
   SET country = a.country
  FROM public.clickbank_audit a
 WHERE s.country IS NULL
   AND a.country IS NOT NULL
   AND a.receipt = 'hotmart_' || replace(s.order_id, 'hm_', '');