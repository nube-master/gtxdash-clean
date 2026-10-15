
-- Templates de notificação editáveis
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'custom',
  title_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  available_variables text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notification_templates"
  ON public.notification_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert notification_templates"
  ON public.notification_templates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update notification_templates"
  ON public.notification_templates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete notification_templates"
  ON public.notification_templates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Destinatários (cada um com sua webhook URL)
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  webhook_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notification_recipients"
  ON public.notification_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert notification_recipients"
  ON public.notification_recipients FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update notification_recipients"
  ON public.notification_recipients FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete notification_recipients"
  ON public.notification_recipients FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_notification_recipients_updated_at
  BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Preferências: qual destinatário recebe qual tipo de notificação
CREATE TABLE public.recipient_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.notification_recipients(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.notification_templates(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id, template_id)
);

ALTER TABLE public.recipient_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read recipient_notification_prefs"
  ON public.recipient_notification_prefs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert recipient_notification_prefs"
  ON public.recipient_notification_prefs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update recipient_notification_prefs"
  ON public.recipient_notification_prefs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete recipient_notification_prefs"
  ON public.recipient_notification_prefs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Seed: templates padrão do sistema
INSERT INTO public.notification_templates (name, type, title_template, body_template, available_variables, is_system) VALUES
('Pulse 1H', 'pulse_1h', 'GTX OS | OP GERAL — Pulse 1H • {{status}}', '🕐 Última hora: {{vendas_1h}} vendas | R$ {{receita_1h}}\n📊 ROAS {{roas_1h}} | Lucro R$ {{lucro_1h}}\n💰 Investido: R$ {{investido_1h}}\n⏱ CPA: R$ {{cpa_1h}}', '{status,vendas_1h,receita_1h,roas_1h,lucro_1h,investido_1h,cpa_1h,ctr_1h}', true),
('Pulse 1H Acumulado', 'pulse_1h_acc', 'GTX OS | OP GERAL — Acumulado Hoje', '📅 Hoje: {{vendas}} vendas | R$ {{receita}}\n📊 ROAS {{roas}} | Lucro R$ {{lucro}}\n🕒 Sem vender há: {{tempo_sem_venda}}', '{vendas,receita,roas,lucro,investido,tempo_sem_venda,status}', true),
('Venda Aprovada', 'sale_approved', 'Venda aprovada! | GTX OS', '{{utm_campaign}}\nR$ {{valor}}', '{utm_campaign,valor,produto,projeto,store}', true),
('Venda Pendente', 'sale_pending', 'Venda pendente | GTX OS', '{{utm_campaign}}\nR$ {{valor}}', '{utm_campaign,valor,produto,projeto,store}', true),
('Status de Lucro', 'status_lucro', 'GTX OS | {{projeto}} — {{status}}', '💰 Lucro: R$ {{lucro}}\n📊 ROAS: {{roas}}x\n🛒 Vendas: {{vendas}}\n💸 Investido: R$ {{investido}}', '{projeto,status,lucro,roas,vendas,investido,receita}', true),
('Resumo Detalhado', 'resumo_detalhado', 'GTX OS | Resumo • {{periodo}}', '📅 {{periodo}}\n🛒 Vendas: {{vendas}} | Receita: R$ {{receita}}\n📊 ROAS: {{roas}}x | Lucro: R$ {{lucro}}\n💸 Investido: R$ {{investido}}\n⏱ CPA: R$ {{cpa}} | Ticket: R$ {{ticket}}', '{periodo,vendas,receita,roas,lucro,investido,cpa,ticket,status}', true);
