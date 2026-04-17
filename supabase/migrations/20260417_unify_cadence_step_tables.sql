-- Unify cadence step tracking on cadence_step_executions.
-- Migration: 20260417_unify_cadence_step_tables.sql
--
-- Context: 20260417_cadence_restructure.sql created cadence_enrollment_steps,
-- but the codebase (api/_lib/cadence-runner.js, cmo-digest.js, resend-webhook.js)
-- already writes to cadence_step_executions with a richer schema (attempt_count,
-- provider_message_id, delivered_at, opened_at, clicked_at, failure_reason, etc.).
-- Having two step tables = double source of truth.
--
-- This migration:
--   1. Repoints v_active_enrollments, opt_out_enrollment, mark_contact_converted,
--      record_cadence_cta_click to cancel + count from cadence_step_executions
--   2. Moves the "step sent" activity_log trigger to cadence_step_executions
--   3. Drops the orphan cadence_enrollment_steps table
--
-- Applied to production 2026-04-17 via Supabase MCP.

DROP VIEW IF EXISTS v_active_enrollments CASCADE;
CREATE OR REPLACE VIEW v_active_enrollments AS
SELECT
  e.id                AS enrollment_id,
  e.contact_id,
  c.email,
  c.name              AS contact_name,
  c.persona,
  c.stage,
  e.cadence_id,
  ec.name             AS cadence_name,
  ec.methodology,
  e.status,
  e.current_step,
  e.enrolled_at,
  (SELECT MIN(scheduled_at)
     FROM cadence_step_executions s
    WHERE s.enrollment_id = e.id AND s.status = 'pending') AS next_step_at,
  (SELECT COUNT(*) FROM cadence_step_executions s WHERE s.enrollment_id = e.id) AS total_steps,
  (SELECT COUNT(*) FROM cadence_step_executions s WHERE s.enrollment_id = e.id AND s.status = 'sent') AS sent_steps
FROM contact_cadence_enrollments e
JOIN marketing_contacts c ON c.id = e.contact_id
JOIN email_cadences ec    ON ec.id = e.cadence_id
WHERE e.status = 'active';

CREATE OR REPLACE FUNCTION mark_contact_converted(
  p_contact_id UUID, p_stripe_subscription_id TEXT DEFAULT NULL,
  p_stripe_customer_id TEXT DEFAULT NULL, p_revenue_cents INT DEFAULT NULL
) RETURNS INT AS $$
DECLARE v_count INT;
BEGIN
  UPDATE contact_cadence_enrollments
     SET status='converted', exited_at=NOW(), exit_reason='converted',
         stripe_subscription_id=COALESCE(p_stripe_subscription_id, stripe_subscription_id),
         stripe_customer_id=COALESCE(p_stripe_customer_id, stripe_customer_id),
         converted_revenue_cents=COALESCE(p_revenue_cents, converted_revenue_cents)
   WHERE contact_id=p_contact_id AND status='active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE cadence_step_executions SET status='cancelled' WHERE contact_id=p_contact_id AND status='pending';
  INSERT INTO contact_activity_log (contact_id, event_type, event_data, occurred_at)
  VALUES (p_contact_id, 'subscription_created',
          jsonb_build_object('stripe_subscription_id', p_stripe_subscription_id,
                             'stripe_customer_id', p_stripe_customer_id,
                             'revenue_cents', p_revenue_cents,
                             'enrollments_closed', v_count), NOW());
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION opt_out_enrollment(p_enrollment_id UUID, p_reason TEXT DEFAULT 'manual') RETURNS BOOLEAN AS $$
BEGIN
  UPDATE contact_cadence_enrollments SET status='opted_out', exited_at=NOW(), exit_reason=COALESCE(p_reason,'manual')
   WHERE id=p_enrollment_id AND status='active';
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE cadence_step_executions SET status='cancelled' WHERE enrollment_id=p_enrollment_id AND status='pending';
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_cadence_cta_click(p_enrollment_id UUID, p_cta_url TEXT) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO contact_activity_log (contact_id, event_type, event_data, related_enrollment_id, related_cadence_id, occurred_at)
  SELECT contact_id, 'cadence_cta_clicked', jsonb_build_object('cta_url', p_cta_url), id, cadence_id, NOW()
    FROM contact_cadence_enrollments WHERE id=p_enrollment_id;
  UPDATE contact_cadence_enrollments
     SET status='completed', exited_at=NOW(), exit_reason='completed',
         last_cta_url=p_cta_url, last_cta_clicked_at=NOW()
   WHERE id=p_enrollment_id AND status='active';
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE cadence_step_executions SET status='cancelled' WHERE enrollment_id=p_enrollment_id AND status='pending';
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Move "step sent" activity log trigger to the real execution table
DROP TRIGGER IF EXISTS trg_enrollment_step_sent ON cadence_enrollment_steps;
DROP TRIGGER IF EXISTS trg_execution_step_sent ON cadence_step_executions;

CREATE OR REPLACE FUNCTION log_execution_step_sent() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status='sent') THEN
    INSERT INTO contact_activity_log (contact_id, event_type, event_data, related_enrollment_id, related_cadence_id, related_step_id, occurred_at)
    VALUES (NEW.contact_id, 'cadence_step_sent',
            jsonb_build_object('step_num', NEW.step_num, 'step_type', NEW.step_type, 'subject', NEW.subject,
                               'provider_message_id', NEW.provider_message_id),
            NEW.enrollment_id, NEW.cadence_id, NEW.id, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_execution_step_sent
  AFTER UPDATE OF status ON cadence_step_executions
  FOR EACH ROW EXECUTE FUNCTION log_execution_step_sent();

-- Repoint activity_log.related_step_id FK at the live table + drop the orphan
DROP FUNCTION IF EXISTS log_enrollment_step_sent() CASCADE;
ALTER TABLE contact_activity_log DROP CONSTRAINT IF EXISTS contact_activity_log_related_step_id_fkey;
UPDATE contact_activity_log SET related_step_id = NULL WHERE related_step_id IS NOT NULL;
ALTER TABLE contact_activity_log
  ADD CONSTRAINT contact_activity_log_related_step_id_fkey
  FOREIGN KEY (related_step_id) REFERENCES cadence_step_executions(id) ON DELETE SET NULL;

DROP TABLE IF EXISTS cadence_enrollment_steps CASCADE;
