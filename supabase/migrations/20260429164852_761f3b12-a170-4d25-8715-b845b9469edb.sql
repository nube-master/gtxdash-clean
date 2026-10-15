CREATE TABLE public.meta_payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id UUID,
  meta_transaction_id TEXT NOT NULL,
  billing_reference TEXT,
  account_id TEXT NOT NULL,
  account_name TEXT DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  amount_brl NUMERIC,
  charged_at TIMESTAMPTZ NOT NULL,
  charge_date DATE GENERATED ALWAYS AS ((charged_at AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  status TEXT DEFAULT '',
  billing_reason TEXT DEFAULT '',
  payment_method_type TEXT DEFAULT '',
  card_brand TEXT DEFAULT '',
  card_last4 TEXT DEFAULT '',
  vat_invoice_id TEXT,
  raw_payload JSONB,
  matched_card_charge_id UUID,
  match_status TEXT DEFAULT 'unmatched',
  matched_at TIMESTAMPTZ,
  charge_window_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meta_payment_transactions_unique UNIQUE (account_id, meta_transaction_id)
);

CREATE INDEX idx_mpt_billing_ref ON public.meta_payment_transactions (billing_reference) WHERE billing_reference IS NOT NULL;
CREATE INDEX idx_mpt_account_date ON public.meta_payment_transactions (account_id, charge_date DESC);
CREATE INDEX idx_mpt_operation_date ON public.meta_payment_transactions (operation_id, charge_date DESC);
CREATE INDEX idx_mpt_match_status ON public.meta_payment_transactions (match_status, charge_date DESC);
CREATE INDEX idx_mpt_card_last4 ON public.meta_payment_transactions (card_last4) WHERE card_last4 <> '';

ALTER TABLE public.meta_payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read meta_payment_transactions"
  ON public.meta_payment_transactions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service can insert meta_payment_transactions"
  ON public.meta_payment_transactions FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "Service can update meta_payment_transactions"
  ON public.meta_payment_transactions FOR UPDATE
  TO public USING (true);

CREATE POLICY "Admins can delete meta_payment_transactions"
  ON public.meta_payment_transactions FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_meta_payment_transactions_updated_at
  BEFORE UPDATE ON public.meta_payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();