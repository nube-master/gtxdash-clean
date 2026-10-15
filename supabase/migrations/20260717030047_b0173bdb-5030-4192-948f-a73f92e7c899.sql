
ALTER TABLE public.cod_orders
  ADD COLUMN IF NOT EXISTS approved_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_notified_at timestamptz;

INSERT INTO public.notification_templates
  (name, type, title_template, body_template, available_variables, is_active, is_system, project_scope)
VALUES
  (
    'Comissão COD Aprovada',
    'cod_commission_approved',
    'Comissão COD aprovada! 🇪🇺 GTX',
    E'€{{valor}} • Pedido #{{order_id}}\nCriado em {{order_date}} • {{produto}}\nPaís: {{pais}}',
    ARRAY['valor','order_id','order_date','produto','pais','projeto'],
    true, false, 'GTX'
  ),
  (
    'Comissão COD Paga',
    'cod_commission_paid',
    'Comissão COD paga! 🇪🇺 GTX',
    E'€{{valor}} • Pedido #{{order_id}}\nCriado em {{order_date}} • {{produto}}\nPaís: {{pais}}',
    ARRAY['valor','order_id','order_date','produto','pais','projeto'],
    true, false, 'GTX'
  )
ON CONFLICT DO NOTHING;
