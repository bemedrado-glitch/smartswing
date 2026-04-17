-- SmartSwing AI — Free roadmap (items 11 & 12)
-- Adds publish-proof fields on content_calendar and free analytics/pixel IDs
-- on marketing_settings. All columns use ADD COLUMN IF NOT EXISTS so the
-- migration is safe to re-run.

-- ─── content_calendar: publish proof fields ─────────────────────────────────
ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS platform_response JSONB;

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS published_url TEXT;

-- ─── marketing_settings: free analytics / pixel IDs ─────────────────────────
ALTER TABLE marketing_settings
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;

ALTER TABLE marketing_settings
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT;

ALTER TABLE marketing_settings
  ADD COLUMN IF NOT EXISTS gsc_site_url TEXT;
