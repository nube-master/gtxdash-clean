
-- 1) Ativa template de comissão aprovada (pedido entregue COD)
UPDATE public.notification_templates
SET is_active = true, updated_at = now()
WHERE type = 'cod_commission_approved';

-- 2) Inscreve Gabriel Vidal e Guilherme Pires em AMBOS os templates COD
INSERT INTO public.recipient_notification_prefs (recipient_id, template_id, enabled, operation_id)
SELECT r.id, t.id, true, r.operation_id
FROM public.notification_recipients r
CROSS JOIN public.notification_templates t
WHERE r.id IN ('47052cdc-0a76-423c-9c7b-e240b6a86e6f','e0958db9-6e74-42ca-bad6-3e2fa93e20b6')
  AND t.type IN ('cod_commission_approved','cod_commission_paid')
ON CONFLICT DO NOTHING;
