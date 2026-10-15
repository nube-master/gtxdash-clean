
-- Table to store real campaign statuses from Meta API
CREATE TABLE public.meta_campaign_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  effective_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  daily_budget NUMERIC NOT NULL DEFAULT 0,
  lifetime_budget NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, campaign_id)
);

-- Enable RLS
ALTER TABLE public.meta_campaign_status ENABLE ROW LEVEL SECURITY;

-- Public read access (same as traffic_data)
CREATE POLICY "Allow public read meta_campaign_status"
ON public.meta_campaign_status FOR SELECT
USING (true);

-- Service write access
CREATE POLICY "Allow service insert meta_campaign_status"
ON public.meta_campaign_status FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow service update meta_campaign_status"
ON public.meta_campaign_status FOR UPDATE
USING (true);

CREATE POLICY "Allow service delete meta_campaign_status"
ON public.meta_campaign_status FOR DELETE
USING (true);

-- Index for fast lookups by campaign name (used for joining with traffic_data)
CREATE INDEX idx_meta_campaign_status_name ON public.meta_campaign_status(campaign_name);
CREATE INDEX idx_meta_campaign_status_account ON public.meta_campaign_status(account_id);
