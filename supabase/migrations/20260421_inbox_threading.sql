-- SmartSwing AI — Unified inbox threading (Tier 2 #6, slice 1 of 3).
--
-- Extends `inbox_messages` with thread + read + assignment state so dashboards
-- can render conversation views and internal ops can route messages to a
-- specific owner. Backfills one-message-per-thread for existing rows to keep
-- the read model consistent without requiring a UI deploy.
--
-- Slice 1 (this file):
--   * adds inbox_threads + 5 new inbox_messages columns
--   * backfills thread_id 1:1 for existing rows
--   * RLS left intact — inbox_threads inherits membership from inbox_messages
--
-- Slice 2: api/resend-inbound.js to land replies into the right thread.
-- Slice 3: dashboard + coach UI rewrite.

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  -- Creator of the thread (usually the first from_user_id). Used for RLS fallback.
  owner_user_id uuid references public.profiles(id) on delete set null,
  -- Denormalised for list views; updated by a trigger when new messages land.
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  message_count integer not null default 0 check (message_count >= 0),
  unread_count integer not null default 0 check (unread_count >= 0),
  -- Optional ops-side owner (who on our team should handle this).
  assigned_to uuid references public.profiles(id) on delete set null,
  -- Open | pending | resolved | spam. Free-form for forward-compat.
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inbox_threads_owner
  on public.inbox_threads(owner_user_id, last_message_at desc);
create index if not exists idx_inbox_threads_assigned
  on public.inbox_threads(assigned_to, status, last_message_at desc);
create index if not exists idx_inbox_threads_last_msg
  on public.inbox_threads(last_message_at desc);

alter table public.inbox_messages
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete cascade,
  add column if not exists direction text not null default 'internal'
    check (direction in ('inbound', 'outbound', 'internal')),
  add column if not exists read_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.inbox_messages(id) on delete set null,
  -- RFC 5322 Message-ID, used to thread email replies via In-Reply-To / References.
  add column if not exists email_message_id text;

create index if not exists idx_inbox_messages_thread
  on public.inbox_messages(thread_id, created_at asc);
create index if not exists idx_inbox_messages_email_msgid
  on public.inbox_messages(email_message_id)
  where email_message_id is not null;

-- Backfill: every existing message becomes its own single-message thread.
-- Idempotent — only touches rows without a thread_id.
do $$
declare
  r record;
  new_thread_id uuid;
begin
  for r in select id, subject, body, from_user_id, to_user_id, created_at
           from public.inbox_messages
           where thread_id is null
           order by created_at asc
  loop
    insert into public.inbox_threads
      (subject, owner_user_id, last_message_at, last_message_preview, message_count, unread_count, status)
    values
      (coalesce(r.subject, '(no subject)'),
       coalesce(r.from_user_id, r.to_user_id),
       r.created_at,
       substring(coalesce(r.body, '') from 1 for 140),
       1, 0, 'open')
    returning id into new_thread_id;

    update public.inbox_messages set thread_id = new_thread_id where id = r.id;
  end loop;
end $$;

-- From this point on, thread_id is required for all new rows.
alter table public.inbox_messages
  alter column thread_id set not null;

-- Thread roll-up trigger: keep last_message_at / preview / counts fresh so list
-- views never need a correlated subquery.
create or replace function public.inbox_thread_rollup()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.inbox_threads t set
      last_message_at = new.created_at,
      last_message_preview = substring(coalesce(new.body, '') from 1 for 140),
      message_count = t.message_count + 1,
      unread_count = case
        when new.direction = 'inbound' and new.read_at is null then t.unread_count + 1
        else t.unread_count
      end,
      updated_at = now()
    where t.id = new.thread_id;
    return new;
  elsif (tg_op = 'UPDATE') then
    -- Mark-as-read transition
    if old.read_at is null and new.read_at is not null and new.direction = 'inbound' then
      update public.inbox_threads t set
        unread_count = greatest(0, t.unread_count - 1),
        updated_at = now()
      where t.id = new.thread_id;
    end if;
    return new;
  end if;
  return null;
end $$;

drop trigger if exists trg_inbox_thread_rollup_ins on public.inbox_messages;
create trigger trg_inbox_thread_rollup_ins
  after insert on public.inbox_messages
  for each row execute function public.inbox_thread_rollup();

drop trigger if exists trg_inbox_thread_rollup_upd on public.inbox_messages;
create trigger trg_inbox_thread_rollup_upd
  after update of read_at on public.inbox_messages
  for each row execute function public.inbox_thread_rollup();

-- RLS: threads are visible to anyone who can see at least one message in them.
alter table public.inbox_threads enable row level security;

drop policy if exists "inbox_threads_select_via_messages" on public.inbox_threads;
create policy "inbox_threads_select_via_messages"
  on public.inbox_threads
  for select
  using (
    public.is_internal_manager()
    or exists (
      select 1 from public.inbox_messages m
      where m.thread_id = inbox_threads.id
        and (m.from_user_id = auth.uid() or m.to_user_id = auth.uid() or m.user_id = auth.uid())
    )
  );

-- Only internal managers can mutate thread metadata (assignment, status).
drop policy if exists "inbox_threads_update_internal" on public.inbox_threads;
create policy "inbox_threads_update_internal"
  on public.inbox_threads
  for update
  using (public.is_internal_manager())
  with check (public.is_internal_manager());

drop policy if exists "inbox_threads_insert_internal" on public.inbox_threads;
create policy "inbox_threads_insert_internal"
  on public.inbox_threads
  for insert
  with check (public.is_internal_manager() or owner_user_id = auth.uid());
