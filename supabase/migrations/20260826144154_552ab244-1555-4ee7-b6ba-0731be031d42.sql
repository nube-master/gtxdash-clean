-- 1) Soft delete + user_id obrigatório
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.push_subscriptions SET user_id = user_id WHERE false;
DELETE FROM public.push_subscriptions WHERE user_id IS NULL;

ALTER TABLE public.push_subscriptions ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_fkey'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON public.push_subscriptions (user_id) WHERE deleted_at IS NULL;

-- 2) RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notification_recipients TO authenticated;
GRANT ALL ON public.push_notification_recipients TO service_role;

DROP POLICY IF EXISTS "push_subs_admin_read" ON public.push_subscriptions;
CREATE POLICY "push_subs_admin_read" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members me
      JOIN public.operation_members target
        ON target.operation_id = me.operation_id
      WHERE me.user_id = auth.uid()
        AND me.role IN ('owner','admin')
        AND target.user_id = public.push_subscriptions.user_id
    )
  );

-- 3) RPC: listar usuários da operação com status de push
CREATE OR REPLACE FUNCTION public.admin_list_push_users(p_operation_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  member_role text,
  device_count bigint,
  last_used_at timestamptz,
  recipient_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members om
      WHERE om.operation_id = p_operation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(p.email, u.email)::text AS email,
    COALESCE(p.display_name, split_part(COALESCE(p.email, u.email), '@', 1))::text AS display_name,
    om.role::text AS member_role,
    (SELECT count(*) FROM public.push_subscriptions s
      WHERE s.user_id = om.user_id AND s.deleted_at IS NULL AND s.enabled) AS device_count,
    (SELECT max(s.last_used_at) FROM public.push_subscriptions s
      WHERE s.user_id = om.user_id AND s.deleted_at IS NULL) AS last_used_at,
    (SELECT count(*) FROM public.push_notification_recipients r
      WHERE r.user_id = om.user_id AND r.operation_id = p_operation_id AND r.enabled) AS recipient_count
  FROM public.operation_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  LEFT JOIN auth.users u ON u.id = om.user_id
  WHERE om.operation_id = p_operation_id
  ORDER BY 3;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_push_users(uuid) TO authenticated;

-- 4) RPC: copiar preferências de push de um usuário para outro
CREATE OR REPLACE FUNCTION public.admin_copy_push_prefs(
  p_from uuid, p_to uuid, p_operation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.operation_members om
      WHERE om.operation_id = p_operation_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.push_notification_recipients
    WHERE user_id = p_to AND operation_id = p_operation_id;

  INSERT INTO public.push_notification_recipients (user_id, operation_id, notification_type, template_id, enabled)
  SELECT p_to, p_operation_id, r.notification_type, r.template_id, r.enabled
  FROM public.push_notification_recipients r
  WHERE r.user_id = p_from AND r.operation_id = p_operation_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_copy_push_prefs(uuid, uuid, uuid) TO authenticated;