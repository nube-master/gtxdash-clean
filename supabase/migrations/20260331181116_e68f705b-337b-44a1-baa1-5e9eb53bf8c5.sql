ALTER TABLE public.meta_account_financials
  ADD COLUMN IF NOT EXISTS payment_method_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS card_brand text DEFAULT '',
  ADD COLUMN IF NOT EXISTS card_last4 text DEFAULT '';