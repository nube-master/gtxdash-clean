ALTER TABLE public.recipient_notification_prefs 
ADD COLUMN schedule jsonb NOT NULL DEFAULT '[]'::jsonb;