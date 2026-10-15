
ALTER TABLE public.meta_ad_accounts
ADD COLUMN IF NOT EXISTS first_ad_date timestamptz NULL;

COMMENT ON COLUMN public.meta_ad_accounts.first_ad_date IS 'Data/hora em que a conta veiculou seu primeiro anúncio (Meta API). Base para cálculo de farm/aquecimento.';

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_first_ad_date
  ON public.meta_ad_accounts (first_ad_date);
