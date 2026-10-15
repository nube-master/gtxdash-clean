BEGIN;

-- 1. Inserir dados manuais para o dia 20/08 (Fix Imediato)
-- Usando a constraint UNIQUE (date, account_id, campaign_name, adset_name, ad_name)
-- Omitindo campos que não foram passados (campaign_name, adset_name, ad_name serão NULL se o schema permitir, mas a constraint exige valores para o UNIQUE matching)
-- Como campaign_name, adset_name, ad_name fazem parte da constraint, precisamos garantir que eles correspondam ao que a sync-meta-ads tenta inserir ou ao que já existe.
-- Normalmente na sync-meta-ads esses campos são strings vazias ou nulas.
INSERT INTO public.traffic_data (operation_id, account_id, date, spend, impressions, clicks, campaign_name, adset_name, ad_name) VALUES
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1246531708323610','2026-08-20',3349.115,32182,3302, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1678452126568980','2026-08-20',3.41,21,2, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1056576076838554','2026-08-20',3.905,14,4, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1300776715534571','2026-08-20',1891.395,12969,1221, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1157423260787127','2026-08-20',5580.74,48245,3942, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_4518416995113290','2026-08-20',3026.705,23082,2145, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_914902035011378','2026-08-20',6231.5,59499,5851, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_1648237836725143','2026-08-20',583.99,14426,913, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2447877529027535','2026-08-20',3.74,48,4, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_992398967122465','2026-08-20',823.295,7469,696, '', '', ''),
('8707b3f8-ab41-4a63-902c-9ab97fe50c8a','act_2001512933899143','2026-08-20',4.235,16,3, '', '', '')
ON CONFLICT (date, account_id, campaign_name, adset_name, ad_name) DO UPDATE SET 
  spend=EXCLUDED.spend, impressions=EXCLUDED.impressions,
  clicks=EXCLUDED.clicks,
  updated_at=NOW();

-- 2. Reprocessar snapshot imediatamente
SELECT public.refresh_daily_snapshot('8707b3f8-ab41-4a63-902c-9ab97fe50c8a', '2026-08-20');

-- 3. Fix estrutural: Trigger para atualizar snapshot automaticamente ao inserir tráfego
CREATE OR REPLACE FUNCTION public.trigger_refresh_fahto_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.operation_id = '8707b3f8-ab41-4a63-902c-9ab97fe50c8a') THEN
    PERFORM public.refresh_daily_snapshot(NEW.operation_id, NEW.date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_refresh_fahto_snapshot ON public.traffic_data;
CREATE TRIGGER tr_refresh_fahto_snapshot
AFTER INSERT OR UPDATE ON public.traffic_data
FOR EACH ROW
EXECUTE FUNCTION public.trigger_refresh_fahto_snapshot();

COMMIT;