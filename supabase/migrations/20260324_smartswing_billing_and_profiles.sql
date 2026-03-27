-- SmartSwing AI billing, subscription persistence, and richer customer profile fields

create extension if not exists "pgcrypto";

alter table if exists public.profiles
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_interval text default 'monthly',
  add column if not exists subscription_cancel_at_period_end boolean default false,
  add column if not exists subscription_canceled_at timestamptz,
  add column if not exists phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists country text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_billing_interval_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_billing_interval_check
      check (billing_interval in ('monthly', 'yearly'));
  end if;
exception
  when undefined_table then
    null;
end
$$;

create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'stripe',
  plan_id text not null default 'free',
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'yearly')),
  status text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  checkout_session_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_customer_subscriptions_user
on public.customer_subscriptions(user_id, provider);

create index if not exists idx_customer_subscriptions_status
on public.customer_subscriptions(status, current_period_end desc);

create or replace function public.set_customer_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customer_subscriptions_updated_at on public.customer_subscriptions;
create trigger trg_customer_subscriptions_updated_at
before update on public.customer_subscriptions
for each row
execute function public.set_customer_subscriptions_updated_at();

alter table if exists public.customer_subscriptions enable row level security;

drop policy if exists "customer_subscriptions_select_own" on public.customer_subscriptions;
create policy "customer_subscriptions_select_own"
on public.customer_subscriptions
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('manager', 'admin') or coalesce(p.manager_enabled, false) = true)
  )
);
