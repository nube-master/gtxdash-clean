create table if not exists public.pulse_divergence_log (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid,
  report_date date not null,
  hour_brt int,
  pulse_revenue numeric, dash_revenue numeric, revenue_drift_pct numeric,
  pulse_spend numeric, dash_spend numeric, spend_drift_pct numeric,
  pulse_sales int, dash_sales int, sales_drift_pct numeric,
  exceeded boolean not null default false,
  details text,
  created_at timestamptz not null default now()
);
grant select on public.pulse_divergence_log to authenticated;
grant all on public.pulse_divergence_log to service_role;
alter table public.pulse_divergence_log enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pulse_divergence_log' and policyname='pulse_div_read_auth') then
    create policy pulse_div_read_auth on public.pulse_divergence_log for select to authenticated using (true);
  end if;
end $$;
create index if not exists idx_pulse_div_date on public.pulse_divergence_log(report_date desc);