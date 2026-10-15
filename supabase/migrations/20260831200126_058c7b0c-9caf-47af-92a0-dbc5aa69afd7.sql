-- 1) Limpeza retroativa: mantém a linha mais recente por (op, conta, dia, campaign_id, adset_id, ad_id)
DELETE FROM public.traffic_data t
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY operation_id, account_id, date, campaign_id, adset_id, ad_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.traffic_data
  WHERE ad_id IS NOT NULL AND adset_id IS NOT NULL AND campaign_id IS NOT NULL
) d
WHERE t.id = d.id AND d.rn > 1;

-- 2) Prevenção: ao inserir a versão renomeada, apaga a versão antiga da MESMA peça (mesmos IDs)
CREATE OR REPLACE FUNCTION public.traffic_data_dedupe_renamed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ad_id IS NOT NULL AND NEW.adset_id IS NOT NULL AND NEW.campaign_id IS NOT NULL THEN
    DELETE FROM public.traffic_data t
    WHERE t.operation_id = NEW.operation_id
      AND t.account_id   = NEW.account_id
      AND t.date         = NEW.date
      AND t.campaign_id  = NEW.campaign_id
      AND t.adset_id     = NEW.adset_id
      AND t.ad_id        = NEW.ad_id
      AND t.id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_traffic_data_dedupe_renamed ON public.traffic_data;
CREATE TRIGGER trg_traffic_data_dedupe_renamed
BEFORE INSERT ON public.traffic_data
FOR EACH ROW EXECUTE FUNCTION public.traffic_data_dedupe_renamed();