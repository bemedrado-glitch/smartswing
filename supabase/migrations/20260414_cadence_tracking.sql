-- 20260414_cadence_tracking.sql
-- Adds delivery tracking + failure fallback support to cadence_step_executions.
--
-- Goals:
--  1. Surface whether an email/SMS step actually delivered (not just "we called the API")
--  2. Link step executions to Resend email ids so the Resend webhook can mark
--     delivered/opened/clicked back on the right step
--  3. Track failure reasons + skip reasons so fallback logic can route around
--     bounced emails / opted-out SMS without halting the cadence
--  4. Count attempts so a chronically failing step gets escalated instead of
--     silently retried forever
--
-- Idempotent: safe to run multiple times.

alter table public.cadence_step_executions
  add column if not exists resend_email_id text,
  add column if not exists provider_message_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists skipped_reason text,
  add column if not exists attempt_count integer default 0,
  add column if not exists last_attempted_at timestamptz;

-- Look up a step execution by the Resend email id (webhook path)
create index if not exists idx_cadence_step_exec_resend_id
  on public.cadence_step_executions(resend_email_id)
  where resend_email_id is not null;

-- Pull the next batch of pending steps that are due (cron path)
create index if not exists idx_cadence_step_exec_pending_due
  on public.cadence_step_executions(status, scheduled_at)
  where status = 'pending';

-- Lead view: steps for a single enrollment, ordered
create index if not exists idx_cadence_step_exec_enrollment
  on public.cadence_step_executions(enrollment_id, step_num);

-- Lead list per contact
create index if not exists idx_enrollments_contact_status
  on public.contact_cadence_enrollments(contact_id, status);
create index if not exists idx_enrollments_active_due
  on public.contact_cadence_enrollments(status, next_step_at)
  where status = 'active';

-- marketing_contacts: make sure 'lead' stage remains valid (it already is per
-- the 20260328 check constraint). No change needed, but adding an index for
-- the Leads-tab filter query.
create index if not exists idx_marketing_contacts_stage_updated
  on public.marketing_contacts(stage, updated_at desc);
