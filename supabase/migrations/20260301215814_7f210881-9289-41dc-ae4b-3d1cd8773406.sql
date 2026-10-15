
-- Table to store Meta ad account financial/billing data
CREATE TABLE public.meta_account_financials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL UNIQUE,
  account_name text NOT NULL DEFAULT '',
  amount_spent numeric NOT NULL DEFAULT 0,
  account_balance numeric NOT NULL DEFAULT 0,
  spend_cap numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meta_account_financials ENABLE ROW LEVEL SECURITY;

-- Service can insert/update/delete
CREATE POLICY "Allow service insert meta_account_financials"
  ON public.meta_account_financials FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service update meta_account_financials"
  ON public.meta_account_financials FOR UPDATE
  USING (true);

CREATE POLICY "Allow service delete meta_account_financials"
  ON public.meta_account_financials FOR DELETE
  USING (true);

-- Authenticated users can read
CREATE POLICY "Authenticated users can read meta_account_financials"
  ON public.meta_account_financials FOR SELECT
  USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_meta_account_financials_updated_at
  BEFORE UPDATE ON public.meta_account_financials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
