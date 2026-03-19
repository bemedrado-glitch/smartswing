-- SmartSwing retention loop schema
-- Adds goals and progress timeline with drill assignment sync fields.

alter table if exists public.drill_assignments
  add column if not exists external_id text,
  add column if not exists due_date timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_drill_assignments_external_id_unique'
  ) then
    create unique index idx_drill_assignments_external_id_unique
      on public.drill_assignments(external_id);
  end if;
end $$;

create table if not exists public.player_goals (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  metric text not null,
  baseline_value numeric not null default 0,
  target_value numeric not null default 0,
  current_value numeric not null default 0,
  comparator text not null default 'at-least' check (comparator in ('at-least', 'at-most')),
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_events (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.player_goals enable row level security;
alter table public.progress_events enable row level security;

drop policy if exists "player_goals_insert_own" on public.player_goals;
create policy "player_goals_insert_own"
on public.player_goals
for insert
with check (auth.uid() = user_id);

drop policy if exists "player_goals_select_own_or_coach" on public.player_goals;
create policy "player_goals_select_own_or_coach"
on public.player_goals
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.player_goals.user_id
      and cs.coach_id = auth.uid()
  )
);

drop policy if exists "player_goals_update_own_or_coach" on public.player_goals;
create policy "player_goals_update_own_or_coach"
on public.player_goals
for update
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.player_goals.user_id
      and cs.coach_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.player_goals.user_id
      and cs.coach_id = auth.uid()
  )
);

drop policy if exists "progress_events_insert_own" on public.progress_events;
create policy "progress_events_insert_own"
on public.progress_events
for insert
with check (auth.uid() = user_id);

drop policy if exists "progress_events_select_own_or_coach" on public.progress_events;
create policy "progress_events_select_own_or_coach"
on public.progress_events
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.progress_events.user_id
      and cs.coach_id = auth.uid()
  )
);

create index if not exists idx_player_goals_user_status
  on public.player_goals(user_id, status, updated_at desc);

create index if not exists idx_progress_events_user_created
  on public.progress_events(user_id, created_at desc);
