CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid REFERENCES public.operations(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE(user_id, endpoint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_sub" ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_push_user_op ON public.push_subscriptions(user_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_push_op_enabled ON public.push_subscriptions(operation_id, enabled);

CREATE TABLE IF NOT EXISTS public.push_notification_recipients (
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, user_id, notification_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notification_recipients TO authenticated;
GRANT ALL ON public.push_notification_recipients TO service_role;
ALTER TABLE public.push_notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipients_read_own" ON public.push_notification_recipients FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "recipients_admin_manage" ON public.push_notification_recipients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.push_notification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  operation_id uuid,
  notification_type text,
  title text,
  body text,
  payload jsonb,
  status text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.push_notification_history TO authenticated;
GRANT ALL ON public.push_notification_history TO service_role;
ALTER TABLE public.push_notification_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_hist" ON public.push_notification_history FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_hist_user_sent ON public.push_notification_history(user_id, sent_at DESC);