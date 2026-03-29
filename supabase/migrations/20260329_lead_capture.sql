-- Lead Capture Table
CREATE TABLE IF NOT EXISTS lead_captures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  name          TEXT,
  phone         TEXT,
  persona       TEXT DEFAULT 'player',
  source        TEXT,          -- 'landing_page', 'blog', 'free_assessment', 'contact_form', 'referral', 'social'
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  referrer_url  TEXT,
  page_url      TEXT,
  ip_country    TEXT,
  notes         TEXT,
  converted     BOOLEAN DEFAULT FALSE,
  converted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_captures_email ON lead_captures(email);
CREATE INDEX IF NOT EXISTS idx_lead_captures_source ON lead_captures(source);
CREATE INDEX IF NOT EXISTS idx_lead_captures_created ON lead_captures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_captures_converted ON lead_captures(converted);

ALTER TABLE lead_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth lead_captures read" ON lead_captures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth lead_captures write" ON lead_captures FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Allow anonymous inserts (for capture forms)
CREATE POLICY "Anon lead_captures insert" ON lead_captures FOR INSERT TO anon WITH CHECK (true);
