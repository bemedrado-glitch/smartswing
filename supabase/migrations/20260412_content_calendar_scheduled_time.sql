-- Add scheduled_time column to content_calendar for time-of-day scheduling
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS scheduled_time TEXT;

-- Add approval_status column if it doesn't exist (for orchestration approval flow)
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS approval_status TEXT
  CHECK (approval_status IN ('pending', 'approved', 'rejected'))
  DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_content_calendar_approval ON content_calendar(approval_status);
