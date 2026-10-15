
-- Add push notification tracking to redtrack_events
ALTER TABLE public.redtrack_events ADD COLUMN IF NOT EXISTS push_sent_at timestamptz DEFAULT NULL;

-- Index for efficient lookup of unsent purchases
CREATE INDEX IF NOT EXISTS idx_redtrack_unsent_purchases 
ON public.redtrack_events (occurred_at DESC) 
WHERE event_type = 'purchase' AND amount > 0 AND push_sent_at IS NULL;
