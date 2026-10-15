
-- Add account_status to meta_ad_accounts (Meta API account_status field)
-- 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED
ALTER TABLE public.meta_ad_accounts ADD COLUMN IF NOT EXISTS account_status INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.meta_ad_accounts ADD COLUMN IF NOT EXISTS disable_reason TEXT DEFAULT '';

-- Create account UTM aliases table for revenue attribution
CREATE TABLE public.account_utm_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_label TEXT NOT NULL DEFAULT '',
  utm_aliases TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

ALTER TABLE public.account_utm_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read account_utm_aliases"
  ON public.account_utm_aliases FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert account_utm_aliases"
  ON public.account_utm_aliases FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update account_utm_aliases"
  ON public.account_utm_aliases FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete account_utm_aliases"
  ON public.account_utm_aliases FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_account_utm_aliases_updated_at
  BEFORE UPDATE ON public.account_utm_aliases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
