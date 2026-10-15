ALTER TABLE public.meta_ad_accounts ADD COLUMN category text NOT NULL DEFAULT 'own';
COMMENT ON COLUMN public.meta_ad_accounts.category IS 'Account category: own (própria) or rented (alugada)';