-- SmartSwing AI access, privacy, and entitlement guardrails
-- Adds role expansion, subscription/trial metadata, secure messaging,
-- coach-player links, and monthly usage tracking for plan enforcement.

create extension if not exists "pgcrypto";

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%';

  if constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end if;
exception
  when undefined_table then
    null;
end
$$;

alter table if exists public.profiles
  alter column role drop default;

alter table if exists public.profiles
  add column if not exists subscription_status text default 'free',
  add column if not exists trial_plan_id text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_history jsonb default '[]'::jsonb,
  add column if not exists billing_period_end timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists manager_enabled boolean default false;

alter table if exists public.profiles
  alter column role set default 'player';

alter table if exists public.profiles
  add constraint profiles_role_check
  check (role in ('player', 'coach', 'manager', 'admin'));

create table if not exists public.coach_player_links (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists idx_coach_player_links_unique_active
on public.coach_player_links(player_id, coach_id, status);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid references public.profiles(id) on delete cascade,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete set null,
  from_name text,
  to_name text,
  subject text not null,
  body text not null,
  channel text default 'dashboard',
  created_at timestamptz not null default now()
);

create table if not exists public.report_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_key text not null,
  report_count integer not null default 0 check (report_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_key)
);

create index if not exists idx_inbox_messages_created
on public.inbox_messages(created_at desc);

create index if not exists idx_inbox_messages_to_user
on public.inbox_messages(to_user_id, created_at desc);

create index if not exists idx_report_usage_monthly_user
on public.report_usage_monthly(user_id, month_key);

create or replace function public.is_internal_manager()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('manager', 'admin') or coalesce(p.manager_enabled, false) = true)
  );
$$;

create or replace function public.is_assigned_coach(target_player_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.coach_player_links cpl
    where cpl.player_id = target_player_id
      and cpl.coach_id = auth.uid()
      and cpl.status = 'active'
  )
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = target_player_id
      and cs.coach_id = auth.uid()
  );
$$;

create or replace function public.is_message_participant(from_id uuid, to_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = from_id
      or auth.uid() = to_id
      or public.is_internal_manager()
      or (to_id is not null and public.is_assigned_coach(to_id))
      or (from_id is not null and public.is_assigned_coach(from_id));
$$;

alter table if exists public.coach_player_links enable row level security;
alter table if exists public.inbox_messages enable row level security;
alter table if exists public.report_usage_monthly enable row level security;

drop policy if exists "coach_player_links_select_scoped" on public.coach_player_links;
create policy "coach_player_links_select_scoped"
on public.coach_player_links
for select
using (
  auth.uid() = player_id
  or auth.uid() = coach_id
  or public.is_internal_manager()
);

drop policy if exists "coach_player_links_insert_scoped" on public.coach_player_links;
create policy "coach_player_links_insert_scoped"
on public.coach_player_links
for insert
with check (
  auth.uid() = coach_id
  or public.is_internal_manager()
);

drop policy if exists "coach_player_links_update_scoped" on public.coach_player_links;
create policy "coach_player_links_update_scoped"
on public.coach_player_links
for update
using (
  auth.uid() = coach_id
  or public.is_internal_manager()
)
with check (
  auth.uid() = coach_id
  or public.is_internal_manager()
);

drop policy if exists "profiles_select_scoped_guardrails" on public.profiles;
create policy "profiles_select_scoped_guardrails"
on public.profiles
for select
using (
  auth.uid() = id
  or public.is_assigned_coach(id)
  or public.is_internal_manager()
);

drop policy if exists "profiles_update_scoped_guardrails" on public.profiles;
create policy "profiles_update_scoped_guardrails"
on public.profiles
for update
using (
  auth.uid() = id
  or public.is_internal_manager()
)
with check (
  auth.uid() = id
  or public.is_internal_manager()
);

drop policy if exists "inbox_messages_select_scoped" on public.inbox_messages;
create policy "inbox_messages_select_scoped"
on public.inbox_messages
for select
using (
  public.is_message_participant(from_user_id, to_user_id)
);

drop policy if exists "inbox_messages_insert_scoped" on public.inbox_messages;
create policy "inbox_messages_insert_scoped"
on public.inbox_messages
for insert
with check (
  auth.uid() = from_user_id
  or public.is_internal_manager()
);

drop policy if exists "report_usage_monthly_select_scoped" on public.report_usage_monthly;
create policy "report_usage_monthly_select_scoped"
on public.report_usage_monthly
for select
using (
  auth.uid() = user_id
  or public.is_assigned_coach(user_id)
  or public.is_internal_manager()
);

drop policy if exists "report_usage_monthly_insert_scoped" on public.report_usage_monthly;
create policy "report_usage_monthly_insert_scoped"
on public.report_usage_monthly
for insert
with check (
  auth.uid() = user_id
  or public.is_internal_manager()
);

drop policy if exists "report_usage_monthly_update_scoped" on public.report_usage_monthly;
create policy "report_usage_monthly_update_scoped"
on public.report_usage_monthly
for update
using (
  auth.uid() = user_id
  or public.is_internal_manager()
)
with check (
  auth.uid() = user_id
  or public.is_internal_manager()
);
