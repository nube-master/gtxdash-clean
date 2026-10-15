
-- Table for Meta Ads breakdown data (age, gender, placement)
CREATE TABLE public.traffic_breakdowns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  account_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL DEFAULT '',
  breakdown_type TEXT NOT NULL DEFAULT 'demographic', -- 'demographic' or 'placement'
  age TEXT,
  gender TEXT,
  publisher_platform TEXT,
  platform_position TEXT,
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  cpc NUMERIC NOT NULL DEFAULT 0,
  cpm NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_traffic_breakdowns_date ON public.traffic_breakdowns(date);
CREATE INDEX idx_traffic_breakdowns_type ON public.traffic_breakdowns(breakdown_type);
CREATE INDEX idx_traffic_breakdowns_account_date ON public.traffic_breakdowns(account_id, date);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX idx_traffic_breakdowns_unique ON public.traffic_breakdowns(
  date, account_id, campaign_name, breakdown_type, 
  COALESCE(age, ''), COALESCE(gender, ''), 
  COALESCE(publisher_platform, ''), COALESCE(platform_position, '')
);

-- Enable RLS
ALTER TABLE public.traffic_breakdowns ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as traffic_data)
CREATE POLICY "Allow public read traffic_breakdowns"
  ON public.traffic_breakdowns FOR SELECT USING (true);

CREATE POLICY "Allow service insert traffic_breakdowns"
  ON public.traffic_breakdowns FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service update traffic_breakdowns"
  ON public.traffic_breakdowns FOR UPDATE USING (true);

CREATE POLICY "Allow service delete traffic_breakdowns"
  ON public.traffic_breakdowns FOR DELETE USING (true);

-- Timestamp trigger
CREATE TRIGGER update_traffic_breakdowns_updated_at
  BEFORE UPDATE ON public.traffic_breakdowns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
