
-- Business Managers table
CREATE TABLE public.business_managers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bm_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.business_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read business_managers"
  ON public.business_managers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert business_managers"
  ON public.business_managers FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update business_managers"
  ON public.business_managers FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete business_managers"
  ON public.business_managers FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_business_managers_updated_at
  BEFORE UPDATE ON public.business_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add bm_id to meta_ad_accounts
ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS bm_id text DEFAULT NULL;

-- Campaign mapping rules table
CREATE TABLE public.campaign_mapping_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern text NOT NULL,
  pattern_type text NOT NULL DEFAULT 'contains',
  bm_id text DEFAULT NULL,
  account_id text DEFAULT NULL,
  display_name text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'BRL',
  account_type text NOT NULL DEFAULT 'own',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read campaign_mapping_rules"
  ON public.campaign_mapping_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert campaign_mapping_rules"
  ON public.campaign_mapping_rules FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update campaign_mapping_rules"
  ON public.campaign_mapping_rules FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete campaign_mapping_rules"
  ON public.campaign_mapping_rules FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_campaign_mapping_rules_updated_at
  BEFORE UPDATE ON public.campaign_mapping_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
