-- Add unique constraint on redtrack_id for upsert deduplication
ALTER TABLE public.redtrack_events ADD CONSTRAINT redtrack_events_redtrack_id_unique UNIQUE (redtrack_id);