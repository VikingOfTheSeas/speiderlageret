-- Run this once in the Supabase SQL editor
-- (https://supabase.com/dashboard → SQL Editor → New query).
-- It creates the kart_config table used by kart.html + kart-mini.js
-- to sync the warehouse map across every client.

create table if not exists public.kart_config (
  id         int primary key default 1,
  shelves    jsonb,
  shapes     jsonb,
  updated_at timestamptz not null default now(),
  constraint kart_config_single_row check (id = 1)
);

-- Seed the single row so upserts always find a target.
insert into public.kart_config (id) values (1)
on conflict (id) do nothing;

-- Row-Level Security: mirror the policies used on `gjenstander`/`bokser`
-- so the anon key can read + write the map config.
alter table public.kart_config enable row level security;

drop policy if exists "kart_config read"   on public.kart_config;
drop policy if exists "kart_config insert" on public.kart_config;
drop policy if exists "kart_config update" on public.kart_config;

create policy "kart_config read"
  on public.kart_config for select
  to anon, authenticated
  using (true);

create policy "kart_config insert"
  on public.kart_config for insert
  to anon, authenticated
  with check (true);

create policy "kart_config update"
  on public.kart_config for update
  to anon, authenticated
  using (true)
  with check (true);
