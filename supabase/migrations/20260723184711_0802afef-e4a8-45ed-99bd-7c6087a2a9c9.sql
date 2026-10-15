CREATE OR REPLACE FUNCTION public.get_cb_creative_sales(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(campaign_name text, revenue_brl numeric, receipt text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escola_id uuid := '1dd606e3-dac2-4064-b863-9784307c9e98';
BEGIN
  IF p_operation_id IS NULL THEN
    IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT (public.is_super_admin(auth.uid()) OR EXISTS(SELECT 1 FROM public.operation_members WHERE user_id=auth.uid() AND operation_id=p_operation_id AND status='active')) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT mcs.campaign_name, cb.amount_brl, cb.receipt
  FROM public.clickbank_audit cb
  JOIN public.meta_campaign_status mcs ON cb.aff_sub2 = mcs.campaign_id
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND cb.amount_usd BETWEEN 200 AND 260
    AND NULLIF(cb.aff_sub2,'') IS NOT NULL
    AND (p_operation_id IS NULL OR cb.operation_id = p_operation_id)

  UNION ALL

  -- Escola do Dólar (Hotmart): usa os nomes Meta resolvidos primeiro e,
  -- se faltarem, cai para UTMs originais. Isso alimenta campanha, adset e anúncio.
  SELECT
    concat_ws(' | ',
      NULLIF(cb.meta_campaign_name,''),
      NULLIF(cb.meta_adset_name,''),
      NULLIF(cb.meta_ad_name,''),
      NULLIF(cb.utm_campaign,''),
      NULLIF(cb.utm_medium,''),
      NULLIF(cb.utm_content,'')
    ) AS campaign_name,
    cb.amount_brl,
    cb.receipt
  FROM public.clickbank_audit cb
  WHERE cb.date >= p_start_date AND cb.date <= p_end_date
    AND cb.transaction_type = 'SALE'
    AND NULLIF(cb.aff_sub2,'') IS NULL
    AND cb.amount_brl > 0
    AND cb.operation_id = v_escola_id
    AND (p_operation_id IS NULL OR p_operation_id = v_escola_id)
    AND (
      NULLIF(cb.meta_campaign_name,'') IS NOT NULL
      OR NULLIF(cb.meta_adset_name,'') IS NOT NULL
      OR NULLIF(cb.meta_ad_name,'') IS NOT NULL
      OR NULLIF(cb.utm_campaign,'') IS NOT NULL
      OR NULLIF(cb.utm_medium,'') IS NOT NULL
      OR NULLIF(cb.utm_content,'') IS NOT NULL
    );
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_cb_creative_sales(date, date, uuid) TO authenticated, service_role;