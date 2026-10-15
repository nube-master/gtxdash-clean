ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS use_legacy boolean NOT NULL DEFAULT false;

ALTER TABLE public.push_notification_recipients
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL;