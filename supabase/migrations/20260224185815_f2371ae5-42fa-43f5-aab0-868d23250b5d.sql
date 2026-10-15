
-- Create redtrack_events table
CREATE TABLE public.redtrack_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  redtrack_id text,
  event_type text NOT NULL DEFAULT 'purchase',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  clickid text,
  tid text,
  transaction_id text,
  offer_name text,
  product_name text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text DEFAULT 'approved',
  utm_source text,
  utm_campaign text,
  utm_medium text,
  utm_content text,
  utm_term text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for deduplication: prefer redtrack_id, fallback to transaction_id+event_type
CREATE UNIQUE INDEX idx_redtrack_events_redtrack_id ON public.redtrack_events (redtrack_id) WHERE redtrack_id IS NOT NULL;
CREATE UNIQUE INDEX idx_redtrack_events_txn_type ON public.redtrack_events (transaction_id, event_type) WHERE transaction_id IS NOT NULL AND redtrack_id IS NULL;

-- Index for date range queries
CREATE INDEX idx_redtrack_events_occurred_at ON public.redtrack_events (occurred_at);
CREATE INDEX idx_redtrack_events_event_type ON public.redtrack_events (event_type);

-- Enable RLS
ALTER TABLE public.redtrack_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow service insert redtrack_events"
  ON public.redtrack_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service update redtrack_events"
  ON public.redtrack_events FOR UPDATE
  USING (true);

CREATE POLICY "Allow service delete redtrack_events"
  ON public.redtrack_events FOR DELETE
  USING (true);

CREATE POLICY "Authenticated users can read redtrack_events"
  ON public.redtrack_events FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_redtrack_events_updated_at
  BEFORE UPDATE ON public.redtrack_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
