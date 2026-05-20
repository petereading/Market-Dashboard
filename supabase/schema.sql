-- Market Dashboard member/watchlist foundation.
-- Run this in Supabase SQL editor when the project is ready.

create table if not exists public.member_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  patreon_user_id text unique,
  email text,
  display_name text,
  tier text not null default 'visitor' check (tier in ('visitor', 'free', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_settings (
  member_id uuid primary key references public.member_profiles(id) on delete cascade,
  include_symbol_details_in_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_followed_symbols (
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, symbol)
);

create index if not exists member_followed_symbols_symbol_idx
  on public.member_followed_symbols(symbol);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_member_profiles_updated_at on public.member_profiles;
create trigger set_member_profiles_updated_at
before update on public.member_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_member_settings_updated_at on public.member_settings;
create trigger set_member_settings_updated_at
before update on public.member_settings
for each row execute function public.set_updated_at();