create table public.live_sale_attribution (
  id uuid primary key default gen_random_uuid(),
  clickid text not null,
  operation_id uuid references public.operations(id) on delete cascade,
  sale_status text not null check (sale_status in ('CONVERTED','REFUNDED','CHARGEBACK')),
  sale_value_usd numeric(10,2) not null default 0,
  sale_at timestamptz not null,
  product text,
  offer_name text,
  sale_source text check (sale_source in ('CLICKBANK','DIGISTORE24','CARTPANDA','BUYGOODS','NEWSBREAK','OTHER')),
  matched_session_id text,
  matched_player_id text,
  matched_player_name text,
  first_seen_at timestamptz,
  time_to_sale_seconds integer,
  is_orphan boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clickid, operation_id)
);

create index live_sale_attr_op_saleat_idx on public.live_sale_attribution (operation_id, sale_at desc);
create index live_sale_attr_player_idx on public.live_sale_attribution (matched_player_id, sale_at desc);
create index live_sale_attr_orphan_idx on public.live_sale_attribution (is_orphan, sale_at desc) where is_orphan = true;

alter table public.live_sale_attribution enable row level security;

create policy "live_sale_attr_select_own_op"
on public.live_sale_attribution
for select
to authenticated
using (has_role(auth.uid(), 'admin'::app_role) or live_user_in_operation(operation_id));

-- Realtime publication
alter publication supabase_realtime add table public.live_sale_attribution;

-- updated_at trigger
create trigger live_sale_attr_touch_updated_at
before update on public.live_sale_attribution
for each row execute function public.update_updated_at_column();