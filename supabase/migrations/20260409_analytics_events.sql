-- Analytics events table for tracking page views, clicks, and key interactions
-- Used by the marketing dashboard to show real visitor/pageview data

CREATE TABLE IF NOT EXISTS analytics_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  text NOT NULL,               -- 'page_view', 'click', 'signup', 'analysis_run', 'cta_click'
  page_path   text,                        -- e.g. '/for-players.html'
  referrer    text,                        -- document.referrer
  session_id  text,                        -- anonymous session identifier
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata    jsonb DEFAULT '{}'::jsonb,   -- extra data (button_id, utm params, etc.)
  created_at  timestamptz DEFAULT now()
);

-- Indexes for common marketing dashboard queries
CREATE INDEX idx_analytics_events_type_created ON analytics_events (event_type, created_at DESC);
CREATE INDEX idx_analytics_events_page         ON analytics_events (page_path, created_at DESC);
CREATE INDEX idx_analytics_events_session      ON analytics_events (session_id);
CREATE INDEX idx_analytics_events_created      ON analytics_events (created_at DESC);

-- RLS: allow anonymous inserts (tracking), restrict reads to authenticated/service role
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (including anonymous visitors)
CREATE POLICY "analytics_insert_open"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

-- Only authenticated users (marketing dashboard) can read
CREATE POLICY "analytics_read_authenticated"
  ON analytics_events FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
