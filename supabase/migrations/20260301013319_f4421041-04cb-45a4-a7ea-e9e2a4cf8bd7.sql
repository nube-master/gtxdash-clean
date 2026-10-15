-- Create app_settings table for recovery_mode and other flags
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read settings
CREATE POLICY "Authenticated can read app_settings"
  ON public.app_settings FOR SELECT
  USING (true);

-- Only admins can modify settings
CREATE POLICY "Admins can insert app_settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update app_settings"
  ON public.app_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete app_settings"
  ON public.app_settings FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert recovery_mode = true (ACTIVE NOW)
INSERT INTO public.app_settings (key, value) 
VALUES ('recovery_mode', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();
