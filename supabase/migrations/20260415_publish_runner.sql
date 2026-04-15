-- Phase D: publish runner fields
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Index for the runner's primary query (status+date+approval)
CREATE INDEX IF NOT EXISTS idx_content_calendar_due
  ON content_calendar(scheduled_date, scheduled_time)
  WHERE status = 'scheduled';
