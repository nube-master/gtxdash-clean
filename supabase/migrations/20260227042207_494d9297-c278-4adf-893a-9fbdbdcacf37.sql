
-- Add schedule (array of times) per recipient
ALTER TABLE public.notification_recipients
ADD COLUMN schedule jsonb NOT NULL DEFAULT '["08:00", "12:00", "18:00", "23:00"]'::jsonb;
