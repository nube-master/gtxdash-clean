
-- Add project filter per recipient (which projects they receive notifications for)
ALTER TABLE public.notification_recipients
ADD COLUMN project_filter jsonb NOT NULL DEFAULT '["TODOS"]'::jsonb;
