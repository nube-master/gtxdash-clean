CREATE TABLE IF NOT EXISTS public.vsl_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  vturb_player_id TEXT NOT NULL UNIQUE,
  nome_vsl TEXT NOT NULL,
  pitch_time_seconds INT NOT NULL DEFAULT 1990,
  video_duration_seconds INT NOT NULL DEFAULT 4500,
  pasta_vturb TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vsl_origin_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vsl_player_id UUID NOT NULL REFERENCES public.vsl_players(id) ON DELETE CASCADE,
  data_capturada DATE NOT NULL,
  ad_id TEXT NOT NULL,
  total_viewed INT NOT NULL DEFAULT 0,
  total_started INT NOT NULL DEFAULT 0,
  total_over_pitch INT NOT NULL DEFAULT 0,
  total_clicked INT NOT NULL DEFAULT 0,
  play_rate NUMERIC(6,2) DEFAULT 0,
  pitch_rate NUMERIC(6,2) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vsl_player_id, data_capturada, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_vos_player_date ON public.vsl_origin_stats (vsl_player_id, data_capturada);
CREATE INDEX IF NOT EXISTS idx_vos_ad_id ON public.vsl_origin_stats (ad_id);

ALTER TABLE public.vsl_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsl_origin_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_vsl_players" ON public.vsl_players
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_vsl_origin_stats" ON public.vsl_origin_stats
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_vsl_players_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_vsl_players_updated_at ON public.vsl_players;
CREATE TRIGGER trg_vsl_players_updated_at
  BEFORE UPDATE ON public.vsl_players
  FOR EACH ROW EXECUTE FUNCTION public.touch_vsl_players_updated_at();

INSERT INTO public.vsl_players (vturb_player_id, nome_vsl, pitch_time_seconds, pasta_vturb) VALUES
('69e7d25c05c3ed4453da0c90', 'Bill Gates Honey 57:45 (cpmobill)', 3465, 'Memopryl'),
('69f4107ff646b7c8621d8e5e', 'Lead Anthony 33:10 (NewsBreak Native)', 1990, 'Memopryl'),
('69f113bf2e62e594e346b143', 'ads-img + ads-video 32:31', 1951, 'Memopryl'),
('69f21287522025affac98776', 'ML-TOM ADS_VIDEO 33:13', 1993, 'Memopryl'),
('69f7d44f30090a44b9536a32', 'mmpz Memopezil (NHB)', 1990, 'Memopryl'),
('69e7d0ffaf7645fdd1e02831', 'cpmoah', 2123, 'Memopryl'),
('69f94acff4d26cf4d5d0fe14', 'ML2 CHUCK NORRIS 33:43', 2023, 'Memopryl'),
('69f8e73769006590b1978ee4', 'VSL 8', 2000, 'Memopryl'),
('69f410d1f0b4f48e91a18cc6', 'VSL 9', 2000, 'Memopryl'),
('69f2134f026646d4aa71d945', 'VSL 10', 2000, 'Memopryl'),
('69f212b03ea7d424b03488cd', 'VSL 11', 2000, 'Memopryl'),
('69f2109a0478b93f20522544', 'VSL 12', 2000, 'Memopryl'),
('69f11201f4733175dff74fe9', 'VSL 13', 2000, 'Memopryl')
ON CONFLICT (vturb_player_id) DO NOTHING;