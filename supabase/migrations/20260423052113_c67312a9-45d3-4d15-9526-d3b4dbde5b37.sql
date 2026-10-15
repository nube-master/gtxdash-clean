-- Tabela de canais de mídia
CREATE TABLE public.media_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  icon TEXT NOT NULL DEFAULT 'Megaphone',
  -- Identificação
  rt_source_patterns TEXT[] NOT NULL DEFAULT '{}',
  utm_source_patterns TEXT[] NOT NULL DEFAULT '{}',
  campaign_name_patterns TEXT[] NOT NULL DEFAULT '{}',
  -- Origem dos dados
  spend_source TEXT NOT NULL DEFAULT 'redtrack_cost', -- meta_api | redtrack_cost | manual
  revenue_source TEXT NOT NULL DEFAULT 'redtrack', -- redtrack | sales_data | clickbank
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_id, slug)
);

ALTER TABLE public.media_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read media_channels"
  ON public.media_channels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert media_channels"
  ON public.media_channels FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update media_channels"
  ON public.media_channels FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete media_channels"
  ON public.media_channels FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_media_channels_updated_at
  BEFORE UPDATE ON public.media_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de metas de performance por canal
CREATE TABLE public.channel_performance_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID REFERENCES public.operations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.media_channels(id) ON DELETE CASCADE,
  roas_target NUMERIC NOT NULL DEFAULT 1.8,
  cpa_target NUMERIC NOT NULL DEFAULT 80,
  daily_revenue_target NUMERIC NOT NULL DEFAULT 0,
  daily_spend_cap NUMERIC NOT NULL DEFAULT 0,
  min_sales_per_day INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id)
);

ALTER TABLE public.channel_performance_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read channel_performance_goals"
  ON public.channel_performance_goals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert channel_performance_goals"
  ON public.channel_performance_goals FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update channel_performance_goals"
  ON public.channel_performance_goals FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete channel_performance_goals"
  ON public.channel_performance_goals FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_channel_performance_goals_updated_at
  BEFORE UPDATE ON public.channel_performance_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seeds: Meta Ads e NewsBreak (operation_id NULL = global / template)
INSERT INTO public.media_channels (name, slug, color, icon, rt_source_patterns, utm_source_patterns, spend_source, revenue_source, sort_order)
VALUES
  ('Meta Ads', 'meta', '#1877F2', 'Facebook', ARRAY['facebook','metaads','meta'], ARRAY['facebook','meta','fb'], 'meta_api', 'redtrack', 1),
  ('NewsBreak', 'newsbreak', '#E91E63', 'Newspaper', ARRAY['newsbreak','news_break','nb'], ARRAY['newsbreak','news_break','nb'], 'redtrack_cost', 'redtrack', 2);

-- Metas iniciais
INSERT INTO public.channel_performance_goals (channel_id, roas_target, cpa_target, min_sales_per_day, notes)
SELECT id, 1.8, 80, 0, 'Meta inicial Meta Ads' FROM public.media_channels WHERE slug = 'meta';

INSERT INTO public.channel_performance_goals (channel_id, roas_target, cpa_target, min_sales_per_day, notes)
SELECT id, 2.2, 60, 0, 'Meta inicial NewsBreak (canal novo, exigir ROAS maior)' FROM public.media_channels WHERE slug = 'newsbreak';