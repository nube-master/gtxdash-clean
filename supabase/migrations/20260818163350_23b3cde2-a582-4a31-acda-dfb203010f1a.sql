create or replace function public.get_cod_historical_approval_rate(_operation_id uuid)
returns double precision
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select 
      count(*) filter (where status = 'commission_approved') as aprov,
      count(*) filter (where status = 'expired') as expired
    from cod_orders
    where operation_id = _operation_id
      and (created_at at time zone 'America/Sao_Paulo')::date 
          between current_date - interval '40 days' 
              and current_date - interval '10 days'
  )
  select coalesce(round(aprov::numeric / nullif(aprov + expired, 0) * 100, 1), 52.38)::double precision
  from stats;
$$;

grant execute on function public.get_cod_historical_approval_rate(uuid) to authenticated;
grant execute on function public.get_cod_historical_approval_rate(uuid) to service_role;