ALTER TABLE public.traffic_breakdowns ADD COLUMN IF NOT EXISTS country text;

DROP INDEX IF EXISTS idx_traffic_breakdowns_unique;
CREATE UNIQUE INDEX idx_traffic_breakdowns_unique ON public.traffic_breakdowns
  (date, account_id, campaign_name, breakdown_type,
   COALESCE(age, ''::text), COALESCE(gender, ''::text),
   COALESCE(publisher_platform, ''::text), COALESCE(platform_position, ''::text),
   COALESCE(country, ''::text));

CREATE INDEX IF NOT EXISTS idx_traffic_breakdowns_country ON public.traffic_breakdowns (operation_id, breakdown_type, date, country);