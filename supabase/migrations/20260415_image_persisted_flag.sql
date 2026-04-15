-- Flag rows whose image_url still points at an ephemeral DALL-E CDN so the UI
-- can surface a "not yet saved" warning and a one-click rescue action.
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS image_persisted BOOLEAN DEFAULT NULL;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ DEFAULT NULL;
COMMENT ON COLUMN content_calendar.image_persisted IS 'true=mirrored to marketing-media bucket (permanent), false=ephemeral DALL-E URL (expires ~60min), null=no image or pre-flag row';
COMMENT ON COLUMN content_calendar.metrics_updated_at IS 'When insights (likes/impressions/reach) were last refreshed for this post.';
