-- Server-side enforcement for the free-tier report quota.
--
-- Why: until now, the free analysis count lived only in the browser's
-- localStorage. Clearing site data reset the counter and let a user
-- generate unlimited free reports. This migration moves the source of
-- truth to Supabase via two SECURITY DEFINER RPCs that read/write the
-- existing `report_usage_monthly` table on behalf of the authenticated
-- user.
--
-- The RPCs are SECURITY DEFINER so they can atomically check the plan
-- and increment the counter even though the underlying RLS policies on
-- `report_usage_monthly` only allow row-owner reads/writes.

create or replace function public.smartswing_get_user_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- Active paid subscription wins. Otherwise we treat the user as 'free'.
  select coalesce(
    (
      select cs.plan_id
      from public.customer_subscriptions cs
      where cs.user_id = p_user_id
        and cs.status in ('active', 'trialing', 'past_due')
        and cs.plan_id is not null
        and cs.plan_id <> 'free'
      order by cs.updated_at desc
      limit 1
    ),
    'free'
  );
$$;

revoke all on function public.smartswing_get_user_plan(uuid) from public;
grant execute on function public.smartswing_get_user_plan(uuid) to authenticated, service_role;

-- Free plan lifetime quota. Kept here so the server has the canonical
-- value and the client can't tamper with it. Mirrors PLAN_DEFINITIONS.free.
create or replace function public.smartswing_free_report_limit()
returns integer
language sql
immutable
as $$ select 2 $$;

create or replace function public.get_report_usage()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_used integer := 0;
  v_limit integer;
begin
  if v_user is null then
    return json_build_object(
      'allowed', false,
      'used', 0,
      'limit', 0,
      'remaining', 0,
      'plan_id', null,
      'reason', 'not_authenticated'
    );
  end if;

  v_plan := public.smartswing_get_user_plan(v_user);

  if v_plan <> 'free' then
    return json_build_object(
      'allowed', true,
      'used', 0,
      'limit', null,
      'remaining', null,
      'plan_id', v_plan,
      'unlimited', true
    );
  end if;

  select coalesce(report_count, 0) into v_used
  from public.report_usage_monthly
  where user_id = v_user
    and month_key = 'lifetime-free';

  v_limit := public.smartswing_free_report_limit();

  return json_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used),
    'plan_id', 'free',
    'unlimited', false
  );
end;
$$;

revoke all on function public.get_report_usage() from public;
grant execute on function public.get_report_usage() to authenticated;

create or replace function public.consume_free_report()
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_used integer := 0;
  v_limit integer;
  v_new_count integer;
begin
  if v_user is null then
    return json_build_object(
      'allowed', false,
      'used', 0,
      'limit', 0,
      'remaining', 0,
      'plan_id', null,
      'reason', 'not_authenticated'
    );
  end if;

  v_plan := public.smartswing_get_user_plan(v_user);

  -- Paid plans: still record the activity (creates row if absent) but
  -- never block. We track against the calendar month for paid users so
  -- the existing dashboard analytics keep working.
  if v_plan <> 'free' then
    insert into public.report_usage_monthly (user_id, month_key, report_count, updated_at)
    values (
      v_user,
      to_char(now() at time zone 'utc', 'YYYY-MM'),
      1,
      now()
    )
    on conflict (user_id, month_key)
    do update set
      report_count = public.report_usage_monthly.report_count + 1,
      updated_at = now();

    return json_build_object(
      'allowed', true,
      'used', 0,
      'limit', null,
      'remaining', null,
      'plan_id', v_plan,
      'unlimited', true
    );
  end if;

  -- Free plan: atomic check-and-increment against the lifetime row.
  v_limit := public.smartswing_free_report_limit();

  -- Lock the existing row (if any) so concurrent calls are serialized.
  select coalesce(report_count, 0) into v_used
  from public.report_usage_monthly
  where user_id = v_user
    and month_key = 'lifetime-free'
  for update;

  if v_used >= v_limit then
    return json_build_object(
      'allowed', false,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'plan_id', 'free',
      'unlimited', false,
      'reason', 'quota_exhausted'
    );
  end if;

  insert into public.report_usage_monthly (user_id, month_key, report_count, updated_at)
  values (v_user, 'lifetime-free', 1, now())
  on conflict (user_id, month_key)
  do update set
    report_count = public.report_usage_monthly.report_count + 1,
    updated_at = now()
  returning report_count into v_new_count;

  return json_build_object(
    'allowed', true,
    'used', v_new_count,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_new_count),
    'plan_id', 'free',
    'unlimited', false
  );
end;
$$;

revoke all on function public.consume_free_report() from public;
grant execute on function public.consume_free_report() to authenticated;

comment on function public.consume_free_report() is
  'Server-authoritative free-tier quota gate. Returns {allowed, used, limit, remaining, plan_id}. Replaces the old localStorage-only counter.';

comment on function public.get_report_usage() is
  'Returns the current free-tier usage state for the authenticated user without consuming a credit.';
