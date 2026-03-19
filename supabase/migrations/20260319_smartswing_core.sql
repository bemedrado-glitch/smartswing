-- SmartSwing AI core schema
-- Idempotent migration for Supabase Postgres

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'player' check (role in ('player', 'coach', 'admin')),
  age_range text,
  gender text,
  usta_level text,
  utr_rating text,
  preferred_hand text default 'right',
  avatar_url text,
  subscription_tier text default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'player',
  add column if not exists age_range text,
  add column if not exists gender text,
  add column if not exists usta_level text,
  add column if not exists utr_rating text,
  add column if not exists preferred_hand text default 'right',
  add column if not exists avatar_url text,
  add column if not exists subscription_tier text default 'free',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shot_type text not null,
  overall_score integer,
  grade text,
  percentile integer,
  frames_analyzed integer,
  avg_confidence integer,
  avg_landmarks integer,
  avg_angles jsonb not null default '{}'::jsonb,
  metric_comparisons jsonb not null default '[]'::jsonb,
  benchmark_summary text,
  tailored_drills jsonb not null default '[]'::jsonb,
  notes text,
  session_mode text,
  session_goal text,
  setup_score integer,
  video_path text,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.assessments
  add column if not exists shot_type text,
  add column if not exists overall_score integer,
  add column if not exists grade text,
  add column if not exists percentile integer,
  add column if not exists frames_analyzed integer,
  add column if not exists avg_confidence integer,
  add column if not exists avg_landmarks integer,
  add column if not exists avg_angles jsonb default '{}'::jsonb,
  add column if not exists metric_comparisons jsonb default '[]'::jsonb,
  add column if not exists benchmark_summary text,
  add column if not exists tailored_drills jsonb default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists session_mode text,
  add column if not exists session_goal text,
  add column if not exists setup_score integer,
  add column if not exists video_path text,
  add column if not exists analyzed_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

-- ---------------------------------------------------------------------------
-- Coach sessions
-- ---------------------------------------------------------------------------
create table if not exists public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  coach_name text,
  specialty text,
  format text not null default 'Virtual',
  focus text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'canceled')),
  when_at timestamptz not null,
  booked_at timestamptz not null default now()
);

alter table public.coach_sessions
  add column if not exists coach_id uuid references public.profiles(id) on delete set null,
  add column if not exists coach_name text,
  add column if not exists specialty text,
  add column if not exists format text default 'Virtual',
  add column if not exists focus text,
  add column if not exists status text default 'scheduled',
  add column if not exists when_at timestamptz,
  add column if not exists booked_at timestamptz default now();

-- ---------------------------------------------------------------------------
-- Contact messages
-- ---------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.coach_sessions enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "profiles_select_own_or_coach" on public.profiles;
create policy "profiles_select_own_or_coach"
on public.profiles
for select
using (
  auth.uid() = id
  or (
    exists (
      select 1
      from public.coach_sessions cs
      where cs.user_id = public.profiles.id
        and cs.coach_id = auth.uid()
    )
  )
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "assessments_insert_own" on public.assessments;
create policy "assessments_insert_own"
on public.assessments
for insert
with check (auth.uid() = user_id);

drop policy if exists "assessments_select_own_or_coach" on public.assessments;
create policy "assessments_select_own_or_coach"
on public.assessments
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.assessments.user_id
      and cs.coach_id = auth.uid()
  )
);

drop policy if exists "assessments_update_delete_own" on public.assessments;
create policy "assessments_update_delete_own"
on public.assessments
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "coach_sessions_insert_own_user" on public.coach_sessions;
create policy "coach_sessions_insert_own_user"
on public.coach_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "coach_sessions_select_user_or_coach" on public.coach_sessions;
create policy "coach_sessions_select_user_or_coach"
on public.coach_sessions
for select
using (auth.uid() = user_id or auth.uid() = coach_id);

drop policy if exists "coach_sessions_update_user_or_coach" on public.coach_sessions;
create policy "coach_sessions_update_user_or_coach"
on public.coach_sessions
for update
using (auth.uid() = user_id or auth.uid() = coach_id)
with check (auth.uid() = user_id or auth.uid() = coach_id);

drop policy if exists "contact_messages_insert_any_authenticated" on public.contact_messages;
create policy "contact_messages_insert_any_authenticated"
on public.contact_messages
for insert
with check (auth.uid() is not null);

drop policy if exists "contact_messages_select_own" on public.contact_messages;
create policy "contact_messages_select_own"
on public.contact_messages
for select
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tennis-videos', 'tennis-videos', false)
on conflict (id) do nothing;

drop policy if exists "videos_insert_own_folder" on storage.objects;
create policy "videos_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tennis-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "videos_select_own_folder" on storage.objects;
create policy "videos_select_own_folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'tennis-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "videos_delete_own_folder" on storage.objects;
create policy "videos_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tennis-videos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_assessments_user_date on public.assessments(user_id, analyzed_at desc);
create index if not exists idx_assessments_score on public.assessments(overall_score desc);
create index if not exists idx_assessments_shot on public.assessments(shot_type);
create index if not exists idx_coach_sessions_user_when on public.coach_sessions(user_id, when_at asc);
create index if not exists idx_coach_sessions_coach_when on public.coach_sessions(coach_id, when_at asc);
