
-- Table for hourly spend data from Meta Ads API
CREATE TABLE public.traffic_data_hourly (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  hour integer NOT NULL CHECK (hour >= 0 AND hour <= 23),
  account_id text NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX idx_traffic_hourly_unique ON public.traffic_data_hourly (date, hour, account_id);

-- Index for efficient date filtering
CREATE INDEX idx_traffic_hourly_date ON public.traffic_data_hourly (date);

-- Enable RLS
ALTER TABLE public.traffic_data_hourly ENABLE ROW LEVEL SECURITY;

-- Policies matching traffic_data pattern
CREATE POLICY "Authenticated users can read traffic_data_hourly"
  ON public.traffic_data_hourly FOR SELECT
  USING (true);

CREATE POLICY "Allow service insert traffic_data_hourly"
  ON public.traffic_data_hourly FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service update traffic_data_hourly"
  ON public.traffic_data_hourly FOR UPDATE
  USING (true);

CREATE POLICY "Allow service delete traffic_data_hourly"
  ON public.traffic_data_hourly FOR DELETE
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_traffic_hourly_updated_at
  BEFORE UPDATE ON public.traffic_data_hourly
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
