DROP FUNCTION IF EXISTS public.get_cod_daily_pnl_v4(uuid, date, date);

create or replace function public.get_cod_daily_pnl_v4(
  p_operation_id uuid,
  p_date_from date,
  p_date_to date
)
returns table (
  res_date text,
  orders_generated bigint,
  orders_delivered bigint,
  orders_paid bigint,
  revenue_generated numeric,
  revenue_delivered numeric,
  revenue_total numeric,
  commission_generated numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    to_char(o.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as res_date,
    count(*) filter (where o.operation_id = p_operation_id) as orders_generated,
    count(*) filter (where o.operation_id = p_operation_id and o.status = 'commission_approved') as orders_delivered,
    count(*) filter (where o.operation_id = p_operation_id and o.status = 'commission_approved') as orders_paid,
    sum(coalesce(o.order_value, 0)) filter (where o.operation_id = p_operation_id) as revenue_generated,
    sum(coalesce(o.order_value, 0)) filter (where o.operation_id = p_operation_id and o.status = 'commission_approved') as revenue_delivered,
    sum(coalesce(o.commission_value, 0)) filter (where o.operation_id = p_operation_id and o.status = 'commission_approved') as revenue_total,
    sum(coalesce(o.commission_value, 0)) filter (where o.operation_id = p_operation_id) as commission_generated
  from public.cod_orders o
  where o.operation_id = p_operation_id
    and o.created_at at time zone 'America/Sao_Paulo' >= p_date_from::timestamp
    and o.created_at at time zone 'America/Sao_Paulo' <= (p_date_to || ' 23:59:59')::timestamp
  group by 1
  order by 1 desc;
end;
$$;

GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v4(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cod_daily_pnl_v4(uuid, date, date) TO service_role;