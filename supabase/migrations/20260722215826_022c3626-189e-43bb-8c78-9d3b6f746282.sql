
-- 1) FLIP global do STRICT tenant isolation
UPDATE public.feature_flags
SET operation_ids = '{}'::uuid[],
    updated_at = now()
WHERE key = 'strict_tenant_isolation';

-- 2) Cria operação ESCOLA DO DÓLAR (idempotente via slug)
WITH new_op AS (
  INSERT INTO public.operations (
    name, slug, owner_user_id, status, plan,
    timezone, currency, enabled_features
  )
  VALUES (
    'ESCOLA DO DÓLAR 🇧🇷',
    'escola-do-dolar',
    '65453504-89d7-4c18-92c0-19c45b6cd9f4',
    'active',
    'enterprise',
    'America/Sao_Paulo',
    'BRL',
    '["dashboard","analytics","campaigns","meta_ia","creatives","vsls","performance_vsl","ao_vivo","vendas","central_financeira","planning","cashflow","contingencia","war_room","integrations","acessos","pacing_controller"]'::jsonb
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
),
op_id AS (
  SELECT id FROM new_op
  UNION ALL
  SELECT id FROM public.operations WHERE slug='escola-do-dolar'
  LIMIT 1
),
add_member AS (
  INSERT INTO public.operation_members (operation_id, user_id, role, status)
  SELECT id, '65453504-89d7-4c18-92c0-19c45b6cd9f4'::uuid, 'admin', 'active' FROM op_id
  ON CONFLICT DO NOTHING
  RETURNING 1
)
INSERT INTO public.notification_recipients (operation_id, name, webhook_url, is_active)
SELECT id, 'Gabriel Vidal (gabrielvidal156@gmail.com)', '', false FROM op_id
ON CONFLICT DO NOTHING;
