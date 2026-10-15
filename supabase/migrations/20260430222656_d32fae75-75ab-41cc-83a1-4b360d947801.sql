-- ENUMS
DO $$ BEGIN CREATE TYPE offer_status AS ENUM ('ativa', 'em_teste', 'pausada', 'morta', 'arquivada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE offer_vendor AS ENUM ('clickbank', 'buygoods', 'cartpanda', 'hotmart', 'kiwify', 'monetizze', 'outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE offer_nicho AS ENUM ('brain_memory', 'blood_sugar_glp1', 'weight_loss', 'mens_health_ed', 'heart_bp', 'prostate', 'tinnitus', 'joint_pain', 'financial', 'outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE offer_geo AS ENUM ('BR', 'US', 'UK', 'DE', 'FR', 'ES', 'IT', 'CA', 'AU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE offer_tipo AS ENUM ('propria', 'afiliacao', 'spy_capturada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apelido_interno TEXT NOT NULL UNIQUE,
  produto_real TEXT NOT NULL,
  tipo offer_tipo NOT NULL DEFAULT 'afiliacao',
  nicho offer_nicho NOT NULL,
  geo offer_geo NOT NULL DEFAULT 'BR',
  vendor offer_vendor NOT NULL,
  vendor_id TEXT,
  nickname_afiliado TEXT,
  link_checkout TEXT,
  ticket_front_brl NUMERIC(10,2),
  ticket_front_usd NUMERIC(10,2),
  cpa_target_brl NUMERIC(10,2),
  margem_pct NUMERIC(5,2),
  comissao_pct NUMERIC(5,2),
  status offer_status NOT NULL DEFAULT 'em_teste',
  data_inicio DATE,
  data_morte DATE,
  motivo_morte TEXT,
  landing_pages TEXT[],
  pixel_id TEXT,
  vsl_player TEXT,
  vsl_url TEXT,
  notas TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'gabriel',
  updated_by TEXT DEFAULT 'gabriel'
);

CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_nicho ON public.offers(nicho);
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON public.offers(vendor);
CREATE INDEX IF NOT EXISTS idx_offers_apelido ON public.offers(apelido_interno);

CREATE OR REPLACE FUNCTION public.update_offers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_offers_updated_at ON public.offers;
CREATE TRIGGER trg_offers_updated_at BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_offers_updated_at();

CREATE TABLE IF NOT EXISTS public.offer_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  status_anterior offer_status,
  status_novo offer_status NOT NULL,
  motivo TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by TEXT DEFAULT 'gabriel'
);

CREATE INDEX IF NOT EXISTS idx_status_history_offer ON public.offer_status_history(offer_id);

CREATE OR REPLACE FUNCTION public.log_offer_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.offer_status_history (offer_id, status_anterior, status_novo, motivo, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.motivo_morte, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_offer_status ON public.offers;
CREATE TRIGGER trg_log_offer_status AFTER UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.log_offer_status_change();

INSERT INTO public.offers (apelido_interno, produto_real, tipo, nicho, geo, vendor, ticket_front_brl, cpa_target_brl, margem_pct, status, data_inicio, data_morte, motivo_morte, notas) VALUES
('NDM', 'NDM (Neuro)', 'afiliacao', 'brain_memory', 'BR', 'clickbank', 1169.00, 818.00, 30.00, 'morta', '2026-02-01', '2026-04-29', 'Saturação + queda de ROI; 39 campanhas pausadas e 6 ativas renomeadas top→xxx', 'Pausa final 30/04. 10 campanhas em CA USD 1 (account 9027745467352308) precisam rename manual.'),
('ERX', 'ERX (Mens Health)', 'afiliacao', 'mens_health_ed', 'BR', 'clickbank', 1169.00, 818.00, 30.00, 'ativa', '2026-01-15', NULL, NULL, 'Ativa rodando.'),
('GLP', 'GLP (Blood Sugar / GLP-1)', 'afiliacao', 'blood_sugar_glp1', 'BR', 'clickbank', 1169.00, 818.00, 30.00, 'ativa', '2026-01-20', NULL, NULL, 'GLP01 telemed também sob acompanhamento.'),
('CRT', 'CRT (Weight Loss)', 'afiliacao', 'weight_loss', 'BR', 'clickbank', 1169.00, 818.00, 30.00, 'ativa', '2026-02-10', NULL, NULL, NULL),
('NDB', 'NDB (Heart/BP)', 'afiliacao', 'heart_bp', 'BR', 'clickbank', 1169.00, 818.00, 30.00, 'ativa', '2026-03-01', NULL, NULL, 'Pool principal NDM agora — algumas campanhas migrando.'),
('MMP', 'Memopryl (ClickBank)', 'afiliacao', 'brain_memory', 'US', 'clickbank', NULL, NULL, NULL, 'em_teste', '2026-04-25', NULL, NULL, 'Vendor cbfid=63096. Funis: /ads-img, /ads-video, /mmp-mltom-adsvideo. Pixel 801891042714498. Validar affiliate=guipiresp na URL Meta.'),
('GLYCO', 'Glyco Harmony (BuyGoods)', 'afiliacao', 'blood_sugar_glp1', 'US', 'buygoods', NULL, NULL, NULL, 'em_teste', '2026-04-29', NULL, NULL, 'Vendor 12374 BuyGoods. Aguardando email vendor pra liberar tracking.')
ON CONFLICT (apelido_interno) DO NOTHING;

CREATE OR REPLACE VIEW public.v_offers_active AS
SELECT
  o.*,
  (CURRENT_DATE - o.data_inicio)::INT AS dias_rodando,
  CASE
    WHEN o.status = 'morta' AND o.data_morte IS NOT NULL THEN (o.data_morte - o.data_inicio)::INT
    ELSE (CURRENT_DATE - o.data_inicio)::INT
  END AS lifetime_dias
FROM public.offers o
WHERE o.status IN ('ativa', 'em_teste');

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON public.offers;
CREATE POLICY "authenticated_full_access" ON public.offers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_full_access" ON public.offer_status_history;
CREATE POLICY "authenticated_full_access" ON public.offer_status_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);