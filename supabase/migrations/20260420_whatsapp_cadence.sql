-- ═══════════════════════════════════════════════════════════════════════════
-- SmartSwing AI — WhatsApp cadence support (option D: country routing + override)
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds:
--   1. cadence_whatsapp table (WhatsApp steps in a cadence)
--   2. marketing_contacts.preferred_channel column (whatsapp | sms | auto)
--   3. resolve_messaging_channel(phone, preferred) SQL function
--      → returns 'whatsapp' for countries where WhatsApp dominates,
--        'sms' otherwise. 'auto' preference means use country map;
--        explicit 'whatsapp'/'sms' overrides the map.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cadence WhatsApp steps ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cadence_whatsapp (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id       UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  sequence_num     INT NOT NULL,
  -- Meta-approved template name (required for outside-24h sends / cold prospecting)
  template_name    TEXT,
  template_lang    TEXT DEFAULT 'en_US',
  -- Ordered variable list for template body (JSONB array of strings or token refs like "{{first_name}}")
  template_vars    JSONB DEFAULT '[]'::jsonb,
  -- Optional free-form fallback body (only works within 24h window)
  message          TEXT,
  delay_days       INT NOT NULL DEFAULT 0,
  delay_hours      INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cadence_whatsapp_body_chk CHECK (template_name IS NOT NULL OR message IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cadence_whatsapp_cadence
  ON cadence_whatsapp(cadence_id, sequence_num);

ALTER TABLE cadence_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read cadence_whatsapp"
  ON cadence_whatsapp FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cadence_whatsapp"
  ON cadence_whatsapp FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Per-contact preferred channel override ──────────────────────────────
ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS preferred_channel TEXT
  CHECK (preferred_channel IN ('whatsapp', 'sms', 'auto'))
  DEFAULT 'auto';

-- ── 3. Country-code → channel routing function ─────────────────────────────
-- Strategy (option D, 2026-04-20):
--   • explicit 'whatsapp' or 'sms' preference → respect it
--   • 'auto' (default) → infer from E.164 country code
--
-- WhatsApp-dominant countries (>60% adult usage per 2025 Meta/Statista data):
--   BR +55, MX +52, AR +54, CL +56, CO +57, PE +51, UY +598, VE +58,
--   EC +593, BO +591, PY +595, CR +506, PA +507, GT +502, DO +1-809
--   ES +34, PT +351, IT +39, DE +49, NL +31, TR +90, GR +30
--   IN +91, ID +62, MY +60, PK +92, ZA +27, NG +234, KE +254
--   AE +971, SA +966, EG +20
-- SMS-dominant fallback: US/CA +1 (except DR), UK +44, AU +61, NZ +64, JP +81, KR +82
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION resolve_messaging_channel(
  p_phone     TEXT,
  p_preferred TEXT DEFAULT 'auto'
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
  prefix TEXT;
BEGIN
  -- Explicit override wins
  IF p_preferred IN ('whatsapp', 'sms') THEN
    RETURN p_preferred;
  END IF;

  -- No phone → default to sms (cadence-runner will skip it if phone absent anyway)
  IF p_phone IS NULL OR length(trim(p_phone)) < 4 THEN
    RETURN 'sms';
  END IF;

  -- Strip non-digits
  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- Check 3-digit country codes first (more specific), then 2, then 1
  -- 3-digit
  prefix := substring(digits FROM 1 FOR 3);
  IF prefix IN (
    '598','593','591','595','506','507','502','351','971','966',
    '254','234'
  ) THEN RETURN 'whatsapp'; END IF;

  -- 2-digit
  prefix := substring(digits FROM 1 FOR 2);
  IF prefix IN (
    '55','52','54','56','57','51','58',  -- LatAm
    '34','39','49','31','90','30',       -- Europe
    '91','62','60','92','27','20'        -- Asia/Africa
  ) THEN RETURN 'whatsapp'; END IF;

  -- Default: SMS (US/CA +1, UK +44, AU +61, NZ +64, JP +81, KR +82, etc.)
  RETURN 'sms';
END;
$$;

-- Surface routing on the enrollment UI via a view
CREATE OR REPLACE VIEW v_contacts_with_channel AS
SELECT
  mc.*,
  resolve_messaging_channel(mc.phone, COALESCE(mc.preferred_channel, 'auto')) AS resolved_channel
FROM marketing_contacts mc;

GRANT SELECT ON v_contacts_with_channel TO authenticated, anon, service_role;

-- ── Sanity comment ─────────────────────────────────────────────────────────
COMMENT ON TABLE cadence_whatsapp IS
  'WhatsApp Business Cloud API steps in a cadence. Template name required for cold prospecting (outside 24h window). Free-form message only usable within 24h of contact''s last inbound message.';
COMMENT ON COLUMN marketing_contacts.preferred_channel IS
  'Per-contact override: whatsapp | sms | auto. auto = infer from E.164 country code via resolve_messaging_channel().';
COMMENT ON FUNCTION resolve_messaging_channel(TEXT, TEXT) IS
  'Returns ''whatsapp'' or ''sms'' for a given phone + preference. Explicit preference wins; auto uses country-code heuristic (~40 countries flagged WhatsApp-dominant).';
