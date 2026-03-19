-- SmartSwing AI sync extensions
-- Adds benchmark/drill/report structures and external IDs for robust client sync

alter table if exists public.assessments
  add column if not exists external_id text,
  add column if not exists session_mode text,
  add column if not exists session_goal text,
  add column if not exists setup_score integer,
  add column if not exists video_path text;

alter table if exists public.coach_sessions
  add column if not exists external_id text;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_assessments_external_id_unique'
  ) then
    create unique index idx_assessments_external_id_unique on public.assessments(external_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_coach_sessions_external_id_unique'
  ) then
    create unique index idx_coach_sessions_external_id_unique on public.coach_sessions(external_id);
  end if;
end $$;

create table if not exists public.drill_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid references public.assessments(id) on delete set null,
  focus text not null,
  title text not null,
  prescription text not null,
  cue text not null,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_path text not null,
  report_format text not null default 'html' check (report_format in ('html', 'pdf', 'json')),
  created_at timestamptz not null default now()
);

create table if not exists public.shot_benchmarks (
  id uuid primary key default gen_random_uuid(),
  shot_type text not null,
  metric text not null,
  min_value numeric not null,
  optimal_value numeric not null,
  max_value numeric not null,
  source text default 'smartswing_pro_ranges',
  created_at timestamptz not null default now(),
  unique (shot_type, metric)
);

insert into storage.buckets (id, name, public)
values ('analysis-reports', 'analysis-reports', false)
on conflict (id) do nothing;

alter table public.drill_assignments enable row level security;
alter table public.analysis_reports enable row level security;
alter table public.shot_benchmarks enable row level security;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "drills_insert_own" on public.drill_assignments;
create policy "drills_insert_own"
on public.drill_assignments
for insert
with check (auth.uid() = user_id);

drop policy if exists "drills_select_own_or_coach" on public.drill_assignments;
create policy "drills_select_own_or_coach"
on public.drill_assignments
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.drill_assignments.user_id
      and cs.coach_id = auth.uid()
  )
);

drop policy if exists "drills_update_own_or_coach" on public.drill_assignments;
create policy "drills_update_own_or_coach"
on public.drill_assignments
for update
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.drill_assignments.user_id
      and cs.coach_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.drill_assignments.user_id
      and cs.coach_id = auth.uid()
  )
);

drop policy if exists "reports_insert_own" on public.analysis_reports;
create policy "reports_insert_own"
on public.analysis_reports
for insert
with check (auth.uid() = user_id);

drop policy if exists "reports_select_own_or_coach" on public.analysis_reports;
create policy "reports_select_own_or_coach"
on public.analysis_reports
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.coach_sessions cs
    where cs.user_id = public.analysis_reports.user_id
      and cs.coach_id = auth.uid()
  )
);

drop policy if exists "benchmarks_select_authenticated" on public.shot_benchmarks;
create policy "benchmarks_select_authenticated"
on public.shot_benchmarks
for select
using (auth.uid() is not null);

drop policy if exists "analysis_reports_insert_own_folder" on storage.objects;
create policy "analysis_reports_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'analysis-reports'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "analysis_reports_select_own_or_coach" on storage.objects;
create policy "analysis_reports_select_own_or_coach"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'analysis-reports'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or (storage.foldername(name))[1] in (
      select cs.user_id::text
      from public.coach_sessions cs
      where cs.coach_id = auth.uid()
    )
  )
);

insert into public.shot_benchmarks (shot_type, metric, min_value, optimal_value, max_value) values
  ('forehand','shoulder',95,105,115),
  ('forehand','elbow',135,147,160),
  ('forehand','hip',160,170,180),
  ('forehand','knee',145,165,175),
  ('forehand','trunk',30,40,50),
  ('forehand','wrist',155,165,175),
  ('backhand','shoulder',85,95,105),
  ('backhand','elbow',130,142,155),
  ('backhand','hip',155,165,175),
  ('backhand','knee',140,160,170),
  ('backhand','trunk',25,35,45),
  ('backhand','wrist',150,160,170),
  ('serve','shoulder',115,130,145),
  ('serve','elbow',90,105,120),
  ('serve','hip',170,180,190),
  ('serve','knee',130,145,160),
  ('serve','trunk',40,50,60),
  ('serve','wrist',140,150,160),
  ('volley','shoulder',80,90,100),
  ('volley','elbow',125,137,150),
  ('volley','hip',165,175,185),
  ('volley','knee',155,170,180),
  ('volley','trunk',20,30,40),
  ('volley','wrist',160,170,180),
  ('slice','shoulder',82,93,104),
  ('slice','elbow',124,136,148),
  ('slice','hip',156,167,178),
  ('slice','knee',146,158,170),
  ('slice','trunk',18,28,38),
  ('slice','wrist',142,154,166),
  ('drop-shot','shoulder',76,87,98),
  ('drop-shot','elbow',118,130,142),
  ('drop-shot','hip',160,171,182),
  ('drop-shot','knee',150,162,174),
  ('drop-shot','trunk',16,25,34),
  ('drop-shot','wrist',148,159,170),
  ('lob','shoulder',98,110,122),
  ('lob','elbow',122,136,150),
  ('lob','hip',164,175,186),
  ('lob','knee',138,151,164),
  ('lob','trunk',34,45,56),
  ('lob','wrist',138,150,162)
on conflict (shot_type, metric) do update
set min_value = excluded.min_value,
    optimal_value = excluded.optimal_value,
    max_value = excluded.max_value,
    source = excluded.source;
