CREATE TABLE IF NOT EXISTS public.cod_campaign_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  pattern text NOT NULL,
  mode text NOT NULL DEFAULT 'include' CHECK (mode IN ('include','exclude')),
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cod_campaign_rules TO authenticated;
GRANT ALL ON public.cod_campaign_rules TO service_role;
ALTER TABLE public.cod_campaign_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read cod campaign rules" ON public.cod_campaign_rules;
CREATE POLICY "members read cod campaign rules" ON public.cod_campaign_rules
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.operation_members m WHERE m.operation_id = cod_campaign_rules.operation_id AND m.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage cod campaign rules" ON public.cod_campaign_rules;
CREATE POLICY "admins manage cod campaign rules" ON public.cod_campaign_rules
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.cod_campaign_rules (operation_id, pattern, mode, label)
SELECT '0b758a2b-1b92-4769-b47b-416c567e320d', '(VIT-RRT|ED-POL|EDBAD|BAKING|\[ITA\]|\[SVK\]|\[HU\]|\[POL\]|\[CZE?\]|\[ROM\])', 'include', 'Produtos/geos COD GTX (Vitalrit, ED Polônia, Baking Soda, EU tier)'
WHERE NOT EXISTS (SELECT 1 FROM public.cod_campaign_rules WHERE operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d');

CREATE OR REPLACE FUNCTION public.get_cod_daily_pnl_v13(p_operation_id uuid, p_date_from date, p_date_to date, p_display_currency text DEFAULT 'BRL'::text)
 RETURNS TABLE(res_date date, orders_generated bigint, orders_approved bigint, orders_expired bigint, orders_cancelled bigint, orders_paid bigint, orders_pending bigint, revenue_generated numeric, revenue_approved numeric, revenue_total numeric, commission_generated numeric, pending_commission_total numeric, ticket_avg_approved numeric, commission_avg_approved numeric, avg_comm_7d_brl numeric, invest_total_brl numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_avg_comm_7d numeric;
    v_is_gtx boolean := (p_operation_id = '0b758a2b-1b92-4769-b47b-416c567e320d');
    v_has_rules boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.cod_campaign_rules r WHERE r.operation_id = p_operation_id AND r.is_active AND r.mode = 'include')
      INTO v_has_rules;

    SELECT COALESCE(AVG(commission_value_brl), 501.33) INTO v_avg_comm_7d
    FROM public.cod_orders
    WHERE operation_id = p_operation_id
      AND (status = 'commission_approved' OR (v_is_gtx AND status = 'paid' AND approved_at IS NOT NULL))
      AND (updated_at AT TIME ZONE 'America/Sao_Paulo')::date >= (CURRENT_DATE - INTERVAL '7 days');

    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_date_from, p_date_to, interval '1 day')::date as d
    ),
    daily_stats AS (
        SELECT 
            (created_at AT TIME ZONE 'America/Sao_Paulo')::date as o_date,
            COUNT(*) as gen,
            COUNT(*) FILTER (WHERE (status = 'commission_approved' OR (v_is_gtx AND status = 'paid' AND approved_at IS NOT NULL))) as app,
            COUNT(*) FILTER (WHERE status = 'expired' AND (NOW() - created_at) >= interval '10 days') as exp,
            COUNT(*) FILTER (WHERE status = 'expired' AND (NOW() - created_at) < interval '10 days') as canc,
            COUNT(*) FILTER (WHERE status = 'paid') as paid,
            COUNT(*) FILTER (WHERE status = 'pending') as pend,
            COALESCE(SUM(commission_value_brl), 0) as rev_gen,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE (status = 'commission_approved' OR (v_is_gtx AND status = 'paid' AND approved_at IS NOT NULL))), 0) as rev_app,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE (status = 'commission_approved' OR (v_is_gtx AND status = 'paid' AND approved_at IS NOT NULL))), 0) as rev_tot,
            COALESCE(SUM(commission_value_brl), 0) as comm_gen,
            COALESCE(SUM(commission_value_brl) FILTER (WHERE status = 'pending'), 0) as pend_comm_tot
        FROM public.cod_orders
        WHERE operation_id = p_operation_id
          AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_date_from AND p_date_to
        GROUP BY 1
    ),
    daily_traffic AS (
        SELECT 
            t.date as t_date,
            SUM(t.spend_brl) as invest_brl
        FROM public.traffic_data t
        WHERE t.operation_id = p_operation_id
          AND t.date BETWEEN p_date_from AND p_date_to
          AND (
            NOT v_has_rules
            OR (
              EXISTS (SELECT 1 FROM public.cod_campaign_rules r
                       WHERE r.operation_id = p_operation_id AND r.is_active AND r.mode = 'include'
                         AND COALESCE(t.campaign_name,'') ~* r.pattern)
              AND NOT EXISTS (SELECT 1 FROM public.cod_campaign_rules r
                       WHERE r.operation_id = p_operation_id AND r.is_active AND r.mode = 'exclude'
                         AND COALESCE(t.campaign_name,'') ~* r.pattern)
            )
          )
        GROUP BY 1
    )
    SELECT 
        ds.d as res_date,
        COALESCE(s.gen, 0)::bigint,
        COALESCE(s.app, 0)::bigint,
        COALESCE(s.exp, 0)::bigint,
        COALESCE(s.canc, 0)::bigint,
        COALESCE(s.paid, 0)::bigint,
        COALESCE(s.pend, 0)::bigint,
        COALESCE(s.rev_gen, 0)::numeric,
        COALESCE(s.rev_app, 0)::numeric,
        COALESCE(s.rev_tot, 0)::numeric,
        COALESCE(s.comm_gen, 0)::numeric,
        COALESCE(s.pend_comm_tot, 0)::numeric,
        CASE WHEN COALESCE(s.app, 0) > 0 THEN s.rev_app / s.app ELSE 0 END::numeric,
        CASE WHEN COALESCE(s.app, 0) > 0 THEN s.rev_tot / s.app ELSE 0 END::numeric,
        v_avg_comm_7d::numeric,
        COALESCE(tr.invest_brl, 0)::numeric
    FROM date_series ds
    LEFT JOIN daily_stats s ON ds.d = s.o_date
    LEFT JOIN daily_traffic tr ON ds.d = tr.t_date
    ORDER BY ds.d DESC;
END;
$function$;