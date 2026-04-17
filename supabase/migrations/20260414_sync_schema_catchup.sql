-- 20260414_sync_schema_catchup.sql
-- Fix for cross-device sync bug: assessments + related tables were never
-- receiving inserts because the code expects a richer schema than what
-- was actually deployed to production.
--
-- Symptom: users complete assessments on phone but see zero reports on
-- desktop because the Supabase upsert silently fails due to unknown
-- columns / missing onConflict key.
--
-- This migration:
-- 1. Adds all missing columns to `assessments`
-- 2. Adds the unique `external_id` that upsert onConflict relies on
-- 3. Creates missing tables: coach_sessions, player_goals,
--    drill_assignments, progress_events, inbox_messages
-- 4. Enables RLS + policies on all new tables
--
-- Idempotent: safe to run multiple times.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────
-- 1. ASSESSMENTS: add missing columns + external_id unique key
-- ─────────────────────────────────────────────────────────────────────
alter table public.assessments
  add column if not exists external_id text,
  add column if not exists sport text default 'tennis',
  add column if not exists discipline text,
  add column if not exists apparatus text,
  add column if not exists exercise_type text,
  add column if not exists avg_landmarks integer,
  add column if not exists avg_angles jsonb default '{}'::jsonb,
  add column if not exists avg_derived_metrics jsonb default '{}'::jsonb,
  add column if not exists metric_comparisons jsonb default '[]'::jsonb,
  add column if not exists benchmark_summary jsonb,
  add column if not exists tailored_drills jsonb default '[]'::jsonb,
  add column if not exists tailored_tactics jsonb default '[]'::jsonb,
  add column if not exists component_scores jsonb default '{}'::jsonb,
  add column if not exists performance_kpis jsonb default '{}'::jsonb,
  add column if not exists progress_context jsonb default '{}'::jsonb,
  add column if not exists milestone jsonb default '{}'::jsonb,
  add column if not exists achievements jsonb default '[]'::jsonb,
  add column if not exists projected_ten_score numeric,
  add column if not exists scoring_meta jsonb default '{}'::jsonb,
  add column if not exists player_profile jsonb default '{}'::jsonb,
  add column if not exists session_mode text,
  add column if not exists session_goal text,
  add column if not exists setup_score numeric,
  add column if not exists video_path text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now();

-- Unique external_id so upsert onConflict works
create unique index if not exists idx_assessments_external_id
  on public.assessments(external_id)
  where external_id is not null;

-- ─────────────────────────────────────────────────────────────────────
-- 2. COACH SESSIONS
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  coach_name text,
  specialty text,
  when_at timestamptz not null,
  format text default 'Virtual',
  focus text,
  status text default 'scheduled',
  booked_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists idx_coach_sessions_external_id
  on public.coach_sessions(external_id) where external_id is not null;
create index if not exists idx_coach_sessions_user_when
  on public.coach_sessions(user_id, when_at asc);
create index if not exists idx_coach_sessions_coach_when
  on public.coach_sessions(coach_id, when_at asc);

alter table public.coach_sessions enable row level security;

drop policy if exists "coach_sessions_insert_own_user" on public.coach_sessions;
create policy "coach_sessions_insert_own_user"
on public.coach_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists "coach_sessions_select_user_or_coach" on public.coach_sessions;
create policy "coach_sessions_select_user_or_coach"
on public.coach_sessions for select
using (auth.uid() = user_id or auth.uid() = coach_id);

drop policy if exists "coach_sessions_update_user_or_coach" on public.coach_sessions;
create policy "coach_sessions_update_user_or_coach"
on public.coach_sessions for update
using (auth.uid() = user_id or auth.uid() = coach_id)
with check (auth.uid() = user_id or auth.uid() = coach_id);

drop policy if exists "coach_sessions_delete_own_user" on public.coach_sessions;
create policy "coach_sessions_delete_own_user"
on public.coach_sessions for delete
using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. PLAYER GOALS
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.player_goals (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  metric text,
  baseline_value numeric,
  target_value numeric,
  current_value numeric,
  comparator text,
  status text default 'active',
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_player_goals_external_id
  on public.player_goals(external_id) where external_id is not null;
create index if not exists idx_player_goals_user
  on public.player_goals(user_id, status);

alter table public.player_goals enable row level security;

drop policy if exists "player_goals_all_own" on public.player_goals;
create policy "player_goals_all_own"
on public.player_goals for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. DRILL ASSIGNMENTS
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.drill_assignments (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete set null,
  focus text,
  title text,
  prescription text,
  cue text,
  status text default 'assigned',
  assigned_at timestamptz default now(),
  completed_at timestamptz,
  due_date date,
  created_at timestamptz default now()
);

create unique index if not exists idx_drill_assignments_external_id
  on public.drill_assignments(external_id) where external_id is not null;
create index if not exists idx_drill_assignments_user
  on public.drill_assignments(user_id, status);

alter table public.drill_assignments enable row level security;

drop policy if exists "drill_assignments_all_own" on public.drill_assignments;
create policy "drill_assignments_all_own"
on public.drill_assignments for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. PROGRESS EVENTS
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.progress_events (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  title text,
  detail text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create unique index if not exists idx_progress_events_external_id
  on public.progress_events(external_id) where external_id is not null;
create index if not exists idx_progress_events_user_date
  on public.progress_events(user_id, created_at desc);

alter table public.progress_events enable row level security;

drop policy if exists "progress_events_all_own" on public.progress_events;
create policy "progress_events_all_own"
on public.progress_events for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 6. INBOX MESSAGES
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete set null,
  from_name text,
  to_name text,
  subject text default 'Message',
  body text,
  channel text default 'dashboard',
  created_at timestamptz default now()
);

create unique index if not exists idx_inbox_messages_external_id
  on public.inbox_messages(external_id) where external_id is not null;
create index if not exists idx_inbox_messages_user_date
  on public.inbox_messages(user_id, created_at desc);

alter table public.inbox_messages enable row level security;

drop policy if exists "inbox_messages_insert_own" on public.inbox_messages;
create policy "inbox_messages_insert_own"
on public.inbox_messages for insert
with check (auth.uid() = user_id or auth.uid() = from_user_id);

drop policy if exists "inbox_messages_select_own" on public.inbox_messages;
create policy "inbox_messages_select_own"
on public.inbox_messages for select
using (auth.uid() = user_id or auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "inbox_messages_update_own" on public.inbox_messages;
create policy "inbox_messages_update_own"
on public.inbox_messages for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
