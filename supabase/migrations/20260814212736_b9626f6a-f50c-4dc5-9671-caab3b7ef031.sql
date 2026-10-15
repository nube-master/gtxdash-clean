CREATE OR REPLACE FUNCTION public.get_spend_normalized_sp(p_start_date date, p_end_date date, p_operation_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sp_date date, total_spend numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
 BEGIN
   PERFORM public.require_op_access(p_operation_id);
   RETURN QUERY
 SELECT t.date AS sp_date, COALESCE(SUM(t.spend), 0)::numeric AS total_spend
   FROM public.traffic_data t
   JOIN public.meta_ad_accounts a
     ON a.account_id = t.account_id AND a.is_active = true
   WHERE t.date >= p_start_date AND t.date <= p_end_date
     AND (p_operation_id IS NULL OR t.operation_id = p_operation_id)
     AND (p_operation_id IS NULL OR a.operation_id = p_operation_id)
   GROUP BY t.date;
 END;
$function$;