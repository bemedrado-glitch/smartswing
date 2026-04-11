-- Email events table for Resend webhook tracking
-- Stores delivered, opened, and clicked events for marketing dashboard KPIs

CREATE TABLE IF NOT EXISTS email_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  text NOT NULL,           -- 'email_delivered', 'email_opened', 'email_clicked'
  email       text,                    -- recipient email address
  subject     text,                    -- email subject line
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Indexes for marketing dashboard queries
CREATE INDEX idx_email_events_type_created ON email_events (event_type, created_at DESC);
CREATE INDEX idx_email_events_email ON email_events (email);
CREATE INDEX idx_email_events_created ON email_events (created_at DESC);

-- RLS: service role can insert (webhook), authenticated can read (dashboard)
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_insert_email_events"
  ON email_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "authenticated_read_email_events"
  ON email_events FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
