create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_secret text,
  client_name text not null,
  redirect_uris jsonb not null,
  grant_types jsonb not null default '["authorization_code","refresh_token"]'::jsonb,
  response_types jsonb not null default '["code"]'::jsonb,
  scope text not null,
  token_endpoint_auth_method text default 'none',
  created_at timestamptz not null default now()
);

grant all on public.mcp_oauth_clients to service_role;
alter table public.mcp_oauth_clients enable row level security;
drop policy if exists "service_role_only_mcp_oauth_clients" on public.mcp_oauth_clients;
create policy "service_role_only_mcp_oauth_clients" on public.mcp_oauth_clients
  for all to service_role using (true) with check (true);

create table if not exists public.mcp_oauth_codes (
  code text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid,
  redirect_uri text not null,
  scope text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_codes_expires on public.mcp_oauth_codes(expires_at);
grant all on public.mcp_oauth_codes to service_role;
alter table public.mcp_oauth_codes enable row level security;
drop policy if exists "service_role_only_mcp_oauth_codes" on public.mcp_oauth_codes;
create policy "service_role_only_mcp_oauth_codes" on public.mcp_oauth_codes
  for all to service_role using (true) with check (true);

alter table public.mcp_tokens add column if not exists oauth_client_id text references public.mcp_oauth_clients(client_id) on delete set null;
alter table public.mcp_tokens add column if not exists refresh_token_hash text;
create index if not exists idx_mcp_tokens_refresh on public.mcp_tokens(refresh_token_hash) where refresh_token_hash is not null;

do $$
begin
  perform cron.unschedule('mcp-oauth-cleanup');
exception when others then null;
end$$;

select cron.schedule(
  'mcp-oauth-cleanup',
  '*/15 * * * *',
  $$ delete from public.mcp_oauth_codes where expires_at < now() or used = true; $$
);