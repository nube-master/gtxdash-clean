
-- Table to store which Meta ad accounts are active for syncing
CREATE TABLE public.meta_ad_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL UNIQUE,
  account_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read meta_ad_accounts"
ON public.meta_ad_accounts FOR SELECT
USING (true);

CREATE POLICY "Allow authenticated insert meta_ad_accounts"
ON public.meta_ad_accounts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow authenticated update meta_ad_accounts"
ON public.meta_ad_accounts FOR UPDATE
USING (true);

CREATE POLICY "Allow authenticated delete meta_ad_accounts"
ON public.meta_ad_accounts FOR DELETE
USING (true);

CREATE TRIGGER update_meta_ad_accounts_updated_at
BEFORE UPDATE ON public.meta_ad_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
