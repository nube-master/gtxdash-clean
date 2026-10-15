
CREATE TABLE public.clickbank_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt text NOT NULL,
  transaction_type text NOT NULL DEFAULT 'SALE',
  amount_usd numeric NOT NULL DEFAULT 0,
  amount_brl numeric NOT NULL DEFAULT 0,
  product_name text,
  vendor text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  key_used text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receipt)
);

ALTER TABLE public.clickbank_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service insert clickbank_audit"
  ON public.clickbank_audit FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read clickbank_audit"
  ON public.clickbank_audit FOR SELECT
  USING (true);

CREATE POLICY "Allow service delete clickbank_audit"
  ON public.clickbank_audit FOR DELETE
  USING (true);
