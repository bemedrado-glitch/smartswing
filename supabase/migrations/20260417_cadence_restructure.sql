-- SmartSwing AI Marketing Dashboard — Cadence Restructure
-- Migration: 20260417_cadence_restructure.sql
--
-- Purpose:
--   1. Formalize contact → cadence enrollment model (one active enrollment per contact per cadence).
--   2. Track every step (email/SMS) executed for an enrollment.
--   3. Unified activity log for History tab.
--   4. Repurpose marketing_campaigns for Paid Media only, with full step + ad-creative build-out.
--
-- Notes:
--   - Does NOT rename email_cadences. The app continues to use that table as-is.
--   - Safe to re-run (IF NOT EXISTS / OR REPLACE everywhere).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. CADENCE ENROLLMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contact_cadence_enrollments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id                UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  cadence_id                UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  status                    TEXT NOT NULL CHECK (status IN ('active','opted_out','completed','converted','paused')) DEFAULT 'active',
  current_step              INT NOT NULL DEFAULT 0,
  enrolled_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at                 TIMESTAMPTZ,
  exit_reason               TEXT CHECK (exit_reason IN ('opted_out','converted','completed','manual','error')),
  converted_revenue_cents   INT,
  stripe_subscription_id    TEXT,
  stripe_customer_id        TEXT,
  last_cta_url              TEXT,
  last_cta_clicked_at       TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A contact can only be actively enrolled once per cadence at a time.
-- Re-enrollment after opt-out/completed is allowed (unique excludes non-active rows).
CREATE UNIQUE INDEX IF NOT EXISTS ux_enrollments_active_per_cadence
  ON contact_cadence_enrollments(contact_id, cadence_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_enrollments_contact           ON contact_cadence_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_cadence           ON contact_cadence_enrollments(cadence_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status            ON contact_cadence_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_stripe_sub        ON contact_cadence_enrollments(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ENROLLMENT STEPS (per-send ledger)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cadence_enrollment_steps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    UUID NOT NULL REFERENCES contact_cadence_enrollments(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  cadence_id       UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  step_num         INT NOT NULL,
  step_type        TEXT NOT NULL CHECK (step_type IN ('email','sms')),
  subject          TEXT,
  body             TEXT,
  message          TEXT,
  status           TEXT NOT NULL CHECK (status IN ('pending','sent','failed','skipped','cancelled')) DEFAULT 'pending',
  scheduled_at     TIMESTAMPTZ NOT NULL,
  executed_at      TIMESTAMPTZ,
  external_id      TEXT,
  error            TEXT,
  opened_at        TIMESTAMPTZ,
  clicked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrollment_steps_enrollment ON cadence_enrollment_steps(enrollment_id, step_num);
CREATE INDEX IF NOT EXISTS idx_enrollment_steps_pending    ON cadence_enrollment_steps(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_enrollment_steps_contact    ON cadence_enrollment_steps(contact_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. CONTACT ACTIVITY LOG (History tab)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contact_activity_log (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id                UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  event_type                TEXT NOT NULL CHECK (event_type IN (
    'cadence_enrolled',
    'cadence_step_sent',
    'cadence_cta_clicked',
    'cadence_opened',
    'cadence_opted_out',
    'cadence_completed',
    'cadence_converted',
    'content_created',
    'post_published',
    'email_sent',
    'sms_sent',
    'blog_published',
    'plan_selected',
    'checkout_started',
    'checkout_completed',
    'subscription_created',
    'note_added'
  )),
  event_data                JSONB NOT NULL DEFAULT '{}',
  related_enrollment_id     UUID REFERENCES contact_cadence_enrollments(id) ON DELETE SET NULL,
  related_cadence_id        UUID REFERENCES email_cadences(id) ON DELETE SET NULL,
  related_campaign_id       UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  related_step_id           UUID REFERENCES cadence_enrollment_steps(id) ON DELETE SET NULL,
  occurred_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_contact    ON contact_activity_log(contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_event_type ON contact_activity_log(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_enrollment ON contact_activity_log(related_enrollment_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PAID MEDIA CAMPAIGN BUILD-OUT
--    marketing_campaigns already exists. We add:
--      - campaign_steps: ordered plan of what to do and when
--      - campaign_ad_creatives: ad assets tied to campaigns/steps (Meta/Google/LinkedIn ads)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tag campaigns that belong to paid media so the UI filters cleanly.
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS is_paid_media   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ad_platform     TEXT CHECK (ad_platform IN ('meta','google','tiktok','linkedin','youtube','reddit','x')),
  ADD COLUMN IF NOT EXISTS objective       TEXT CHECK (objective IN ('awareness','traffic','engagement','leads','conversions','app_installs','video_views','sales')),
  ADD COLUMN IF NOT EXISTS daily_budget_cents    INT,
  ADD COLUMN IF NOT EXISTS total_budget_cents    INT;

CREATE TABLE IF NOT EXISTS campaign_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  step_num        INT NOT NULL,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL CHECK (step_type IN (
    'content_piece','ad_creative','landing_page','email_blast','launch','research','creative_brief','pixel_setup','audience_build','retargeting'
  )),
  content_brief   TEXT,
  deliverables    JSONB NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL CHECK (status IN ('planned','in_progress','completed','skipped','blocked')) DEFAULT 'planned',
  due_date        DATE,
  owner           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, step_num)
);

CREATE INDEX IF NOT EXISTS idx_campaign_steps_campaign ON campaign_steps(campaign_id, step_num);
CREATE INDEX IF NOT EXISTS idx_campaign_steps_status   ON campaign_steps(status);

CREATE TABLE IF NOT EXISTS campaign_ad_creatives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES campaign_steps(id) ON DELETE SET NULL,
  creative_type   TEXT NOT NULL CHECK (creative_type IN ('image','video','carousel','collection','story','short')),
  platform        TEXT NOT NULL CHECK (platform IN ('meta','instagram','facebook','tiktok','youtube','linkedin','google','x')),
  placement       TEXT,
  headline        TEXT,
  primary_text    TEXT,
  description     TEXT,
  cta             TEXT,
  asset_url       TEXT,
  thumbnail_url   TEXT,
  destination_url TEXT,
  utm_params      JSONB DEFAULT '{}',
  status          TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','live','paused','archived')) DEFAULT 'draft',
  meta_ad_id      TEXT,
  variant_group   TEXT,
  performance     JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON campaign_ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_step     ON campaign_ad_creatives(step_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_status   ON campaign_ad_creatives(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Reusable updated_at helper (already created in 20260328_marketing_dashboard.sql).
-- Just apply it to new tables.

DROP TRIGGER IF EXISTS trg_enrollments_updated_at ON contact_cadence_enrollments;
CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON contact_cadence_enrollments
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_campaign_steps_updated_at ON campaign_steps;
CREATE TRIGGER trg_campaign_steps_updated_at
  BEFORE UPDATE ON campaign_steps
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ad_creatives_updated_at ON campaign_ad_creatives;
CREATE TRIGGER trg_ad_creatives_updated_at
  BEFORE UPDATE ON campaign_ad_creatives
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Auto-log enrollment status changes to activity_log.
CREATE OR REPLACE FUNCTION log_enrollment_state_change() RETURNS TRIGGER AS $$
DECLARE
  v_event TEXT;
BEGIN
  -- New enrollment row
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO contact_activity_log (contact_id, event_type, event_data, related_enrollment_id, related_cadence_id, occurred_at)
    VALUES (NEW.contact_id, 'cadence_enrolled',
            jsonb_build_object('step', NEW.current_step),
            NEW.id, NEW.cadence_id, NOW());
    RETURN NEW;
  END IF;

  -- Status transition
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    v_event := CASE NEW.status
      WHEN 'opted_out' THEN 'cadence_opted_out'
      WHEN 'converted' THEN 'cadence_converted'
      WHEN 'completed' THEN 'cadence_completed'
      ELSE NULL
    END;
    IF v_event IS NOT NULL THEN
      INSERT INTO contact_activity_log (contact_id, event_type, event_data, related_enrollment_id, related_cadence_id, occurred_at)
      VALUES (NEW.contact_id, v_event,
              jsonb_build_object(
                'from_status', OLD.status,
                'to_status', NEW.status,
                'step', NEW.current_step,
                'exit_reason', NEW.exit_reason,
                'stripe_subscription_id', NEW.stripe_subscription_id,
                'converted_revenue_cents', NEW.converted_revenue_cents
              ),
              NEW.id, NEW.cadence_id, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrollment_state_change ON contact_cadence_enrollments;
CREATE TRIGGER trg_enrollment_state_change
  AFTER INSERT OR UPDATE OF status ON contact_cadence_enrollments
  FOR EACH ROW EXECUTE FUNCTION log_enrollment_state_change();

-- Auto-log step sends.
CREATE OR REPLACE FUNCTION log_enrollment_step_sent() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent') THEN
    INSERT INTO contact_activity_log (contact_id, event_type, event_data, related_enrollment_id, related_cadence_id, related_step_id, occurred_at)
    VALUES (NEW.contact_id, 'cadence_step_sent',
            jsonb_build_object(
              'step_num', NEW.step_num,
              'step_type', NEW.step_type,
              'subject', NEW.subject,
              'external_id', NEW.external_id
            ),
            NEW.enrollment_id, NEW.cadence_id, NEW.id, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrollment_step_sent ON cadence_enrollment_steps;
CREATE TRIGGER trg_enrollment_step_sent
  AFTER UPDATE OF status ON cadence_enrollment_steps
  FOR EACH ROW EXECUTE FUNCTION log_enrollment_step_sent();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. HELPER: mark-converted stored procedure
--    Called by Stripe webhook when a checkout completes for an email that matches
--    a contact with active enrollment(s). Removes the contact from ALL active
--    cadence enrollments (per decision B: converted = remove from active).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mark_contact_converted(
  p_contact_id             UUID,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_stripe_customer_id     TEXT DEFAULT NULL,
  p_revenue_cents          INT DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE contact_cadence_enrollments
     SET status                  = 'converted',
         exited_at               = NOW(),
         exit_reason             = 'converted',
         stripe_subscription_id  = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
         stripe_customer_id      = COALESCE(p_stripe_customer_id, stripe_customer_id),
         converted_revenue_cents = COALESCE(p_revenue_cents, converted_revenue_cents)
   WHERE contact_id = p_contact_id
     AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Cancel any pending steps for this contact's (now ex-)active enrollments
  UPDATE cadence_enrollment_steps
     SET status = 'cancelled'
   WHERE contact_id = p_contact_id
     AND status = 'pending';

  -- High-level log row regardless of enrollment count
  INSERT INTO contact_activity_log (contact_id, event_type, event_data, occurred_at)
  VALUES (p_contact_id, 'subscription_created',
          jsonb_build_object(
            'stripe_subscription_id', p_stripe_subscription_id,
            'stripe_customer_id', p_stripe_customer_id,
            'revenue_cents', p_revenue_cents,
            'enrollments_closed', v_count
          ),
          NOW());

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. HELPER: opt-out stored procedure
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION opt_out_enrollment(
  p_enrollment_id UUID,
  p_reason        TEXT DEFAULT 'manual'
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE contact_cadence_enrollments
     SET status      = 'opted_out',
         exited_at   = NOW(),
         exit_reason = COALESCE(p_reason, 'manual')
   WHERE id = p_enrollment_id
     AND status = 'active';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE cadence_enrollment_steps
     SET status = 'cancelled'
   WHERE enrollment_id = p_enrollment_id
     AND status = 'pending';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. HELPER: record CTA click (removes from THIS enrollment only — per decision B)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_cadence_cta_click(
  p_enrollment_id UUID,
  p_cta_url       TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Log the click first (non-destructive)
  INSERT INTO contact_activity_log (contact_id, event_type, event_data, related_enrollment_id, related_cadence_id, occurred_at)
  SELECT contact_id, 'cadence_cta_clicked',
         jsonb_build_object('cta_url', p_cta_url),
         id, cadence_id, NOW()
    FROM contact_cadence_enrollments
   WHERE id = p_enrollment_id;

  -- Move enrollment out of active
  UPDATE contact_cadence_enrollments
     SET status              = 'completed',
         exited_at           = NOW(),
         exit_reason         = 'completed',
         last_cta_url        = p_cta_url,
         last_cta_clicked_at = NOW()
   WHERE id = p_enrollment_id
     AND status = 'active';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE cadence_enrollment_steps
     SET status = 'cancelled'
   WHERE enrollment_id = p_enrollment_id
     AND status = 'pending';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contact_cadence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_enrollment_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_activity_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_ad_creatives       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated all enrollments" ON contact_cadence_enrollments;
CREATE POLICY "Authenticated all enrollments" ON contact_cadence_enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all enrollment_steps" ON cadence_enrollment_steps;
CREATE POLICY "Authenticated all enrollment_steps" ON cadence_enrollment_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all activity_log" ON contact_activity_log;
CREATE POLICY "Authenticated all activity_log" ON contact_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all campaign_steps" ON campaign_steps;
CREATE POLICY "Authenticated all campaign_steps" ON campaign_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all campaign_creatives" ON campaign_ad_creatives;
CREATE POLICY "Authenticated all campaign_creatives" ON campaign_ad_creatives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. CONVENIENCE VIEWS (read-only, used by dashboard list views)
-- ═══════════════════════════════════════════════════════════════════════════════

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
     FROM cadence_enrollment_steps s
    WHERE s.enrollment_id = e.id AND s.status = 'pending') AS next_step_at,
  (SELECT COUNT(*) FROM cadence_enrollment_steps s WHERE s.enrollment_id = e.id) AS total_steps,
  (SELECT COUNT(*) FROM cadence_enrollment_steps s WHERE s.enrollment_id = e.id AND s.status = 'sent') AS sent_steps
FROM contact_cadence_enrollments e
JOIN marketing_contacts c ON c.id = e.contact_id
JOIN email_cadences ec    ON ec.id = e.cadence_id
WHERE e.status = 'active';

CREATE OR REPLACE VIEW v_contact_history AS
SELECT
  l.id,
  l.contact_id,
  c.email,
  c.name         AS contact_name,
  l.event_type,
  l.event_data,
  l.related_enrollment_id,
  l.related_cadence_id,
  ec.name        AS cadence_name,
  l.related_campaign_id,
  mc.name        AS campaign_name,
  l.occurred_at
FROM contact_activity_log l
JOIN marketing_contacts c ON c.id = l.contact_id
LEFT JOIN email_cadences ec      ON ec.id = l.related_cadence_id
LEFT JOIN marketing_campaigns mc ON mc.id = l.related_campaign_id
ORDER BY l.occurred_at DESC;
