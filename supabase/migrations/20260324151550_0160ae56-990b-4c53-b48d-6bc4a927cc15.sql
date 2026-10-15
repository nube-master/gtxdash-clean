
ALTER TABLE public.clickbank_audit 
  ADD COLUMN IF NOT EXISTS item_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT NULL;

COMMENT ON COLUMN public.clickbank_audit.item_name IS 'ClickBank product item SKU (cproditem/productTitle)';
COMMENT ON COLUMN public.clickbank_audit.quantity IS 'Number of units (potes) derived from amount or product SKU';
