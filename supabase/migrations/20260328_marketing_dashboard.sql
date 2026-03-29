-- SmartSwing AI Marketing Dashboard
-- Migration: 20260328_marketing_dashboard.sql

-- Marketing Contacts (CRM)
CREATE TABLE IF NOT EXISTS marketing_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  phone         TEXT,
  persona       TEXT CHECK (persona IN ('player','coach','club','parent','pickleball')) DEFAULT 'player',
  stage         TEXT CHECK (stage IN ('lead','prospect','trial','customer','churned')) DEFAULT 'lead',
  tags          TEXT[] DEFAULT '{}',
  source        TEXT,
  notes         TEXT,
  assigned_to   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            TEXT CHECK (type IN ('email','social','paid','content','event','outreach')) DEFAULT 'email',
  status          TEXT CHECK (status IN ('draft','active','paused','completed','archived')) DEFAULT 'draft',
  target_persona  TEXT,
  start_date      DATE,
  end_date        DATE,
  budget          NUMERIC(12,2),
  description     TEXT,
  brief           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email / SMS Cadences
CREATE TABLE IF NOT EXISTS email_cadences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  methodology     TEXT DEFAULT 'SPIN + Corporate Visions',
  target_persona  TEXT,
  description     TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cadence Emails (steps in a cadence)
CREATE TABLE IF NOT EXISTS cadence_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id      UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  sequence_num    INT NOT NULL,
  subject         TEXT NOT NULL,
  body_html       TEXT,
  body_text       TEXT,
  delay_days      INT NOT NULL DEFAULT 0,
  email_type      TEXT CHECK (email_type IN ('intro','followup','social_proof','cta','urgency','nurture')) DEFAULT 'followup',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cadence SMS (steps in a cadence)
CREATE TABLE IF NOT EXISTS cadence_sms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id      UUID NOT NULL REFERENCES email_cadences(id) ON DELETE CASCADE,
  sequence_num    INT NOT NULL,
  message         TEXT NOT NULL,
  delay_days      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Content Calendar
CREATE TABLE IF NOT EXISTS content_calendar (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  type            TEXT CHECK (type IN ('post','reel','story','video','blog','email','ad','script')) DEFAULT 'post',
  platform        TEXT CHECK (platform IN ('tiktok','instagram','youtube','facebook','blog','email','linkedin')) DEFAULT 'instagram',
  status          TEXT CHECK (status IN ('idea','draft','scheduled','published','archived')) DEFAULT 'draft',
  scheduled_date  DATE,
  published_date  DATE,
  copy_text       TEXT,
  image_url       TEXT,
  campaign_id     UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  assigned_agent  TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Agent Tasks
CREATE TABLE IF NOT EXISTS agent_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type      TEXT NOT NULL CHECK (agent_type IN ('copywriter','social_media','content_creator','ux_designer','marketing_director')),
  task            TEXT NOT NULL,
  status          TEXT CHECK (status IN ('pending','running','completed','failed')) DEFAULT 'pending',
  input_data      JSONB DEFAULT '{}',
  output_data     JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- Brand Mentions
CREATE TABLE IF NOT EXISTS brand_mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  content         TEXT,
  sentiment       TEXT CHECK (sentiment IN ('positive','neutral','negative')) DEFAULT 'neutral',
  url             TEXT,
  mention_date    DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contact Journeys (tracks a contact's lifecycle)
CREATE TABLE IF NOT EXISTS contact_journeys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cadence_id      UUID REFERENCES email_cadences(id) ON DELETE SET NULL,
  campaign_id     UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  notes           TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_persona ON marketing_contacts(persona);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_stage ON marketing_contacts(stage);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_email ON marketing_contacts(email);
CREATE INDEX IF NOT EXISTS idx_content_calendar_scheduled ON content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_platform ON content_calendar(platform);
CREATE INDEX IF NOT EXISTS idx_content_calendar_status ON content_calendar(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_type ON agent_tasks(agent_type);
CREATE INDEX IF NOT EXISTS idx_cadence_emails_cadence ON cadence_emails(cadence_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_cadence_sms_cadence ON cadence_sms(cadence_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_contact_journeys_contact ON contact_journeys(contact_id);

-- Updated_at trigger for contacts
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_marketing_contacts_updated_at ON marketing_contacts;
CREATE TRIGGER update_marketing_contacts_updated_at
  BEFORE UPDATE ON marketing_contacts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Row Level Security
ALTER TABLE marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_sms ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_journeys ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read/write all marketing data (team access)
CREATE POLICY "Authenticated read marketing_contacts" ON marketing_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write marketing_contacts" ON marketing_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read marketing_campaigns" ON marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write marketing_campaigns" ON marketing_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read email_cadences" ON email_cadences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write email_cadences" ON email_cadences FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read cadence_emails" ON cadence_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cadence_emails" ON cadence_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read cadence_sms" ON cadence_sms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cadence_sms" ON cadence_sms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read content_calendar" ON content_calendar FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write content_calendar" ON content_calendar FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read agent_tasks" ON agent_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write agent_tasks" ON agent_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read brand_mentions" ON brand_mentions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write brand_mentions" ON brand_mentions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read contact_journeys" ON contact_journeys FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write contact_journeys" ON contact_journeys FOR ALL TO authenticated USING (true) WITH CHECK (true);
