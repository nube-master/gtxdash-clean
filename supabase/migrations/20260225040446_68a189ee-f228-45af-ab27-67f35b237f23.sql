
-- Add technical dimension columns to redtrack_events
ALTER TABLE public.redtrack_events
  ADD COLUMN IF NOT EXISTS os text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_redtrack_events_os ON public.redtrack_events (os);
CREATE INDEX IF NOT EXISTS idx_redtrack_events_device ON public.redtrack_events (device);
CREATE INDEX IF NOT EXISTS idx_redtrack_events_browser ON public.redtrack_events (browser);
CREATE INDEX IF NOT EXISTS idx_redtrack_events_country ON public.redtrack_events (country);
CREATE INDEX IF NOT EXISTS idx_redtrack_events_city ON public.redtrack_events (city);
CREATE INDEX IF NOT EXISTS idx_redtrack_events_occurred_at ON public.redtrack_events (occurred_at);
