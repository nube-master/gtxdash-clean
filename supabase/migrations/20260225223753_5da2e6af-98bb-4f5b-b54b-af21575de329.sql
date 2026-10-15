
-- Table to store notification preferences
CREATE TABLE public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  
  -- Sale notifications
  send_pending_sales boolean NOT NULL DEFAULT false,
  send_approved_sales boolean NOT NULL DEFAULT true,
  sale_value_format text NOT NULL DEFAULT 'commission', -- 'commission' | 'revenue' | 'hide'
  sale_show_product boolean NOT NULL DEFAULT false,
  sale_show_utm_campaign boolean NOT NULL DEFAULT true,
  sale_show_dashboard_name boolean NOT NULL DEFAULT true,
  
  -- Report notifications
  report_schedule jsonb NOT NULL DEFAULT '["08:00","12:00","18:00","23:00"]'::jsonb,
  report_pattern text NOT NULL DEFAULT 'status_lucro', -- 'status_lucro' | 'resumo_detalhado' | 'criativas'
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_user_settings UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Users can read their own settings
CREATE POLICY "Users can read own notification_settings"
ON public.notification_settings FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert own notification_settings"
ON public.notification_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update own notification_settings"
ON public.notification_settings FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
