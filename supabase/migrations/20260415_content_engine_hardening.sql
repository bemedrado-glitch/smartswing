-- Content Engine Hardening (Phase A + B)
-- 1. Public storage bucket for generated images/videos
-- 2. media_assets registry so we never lose generated media again
-- 3. content_calendar: link to agent task + media asset + brand version

-- ── Storage bucket ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-media',
  'marketing-media',
  true,
  52428800,  -- 50MB
  ARRAY['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read policy on the bucket
DO $$ BEGIN
  CREATE POLICY "Public read marketing-media"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'marketing-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role write (cron + server-side generation)
DO $$ BEGIN
  CREATE POLICY "Service write marketing-media"
    ON storage.objects FOR INSERT TO service_role
    WITH CHECK (bucket_id = 'marketing-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authenticated write (logged-in admins uploading via UI)
DO $$ BEGIN
  CREATE POLICY "Auth write marketing-media"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'marketing-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── media_assets registry ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('image','video','audio')) DEFAULT 'image',
  storage_url      TEXT NOT NULL,
  source_url       TEXT,
  model            TEXT,
  prompt           TEXT,
  content_item_id  UUID REFERENCES content_calendar(id) ON DELETE SET NULL,
  width            INT,
  height           INT,
  size_bytes       BIGINT,
  brand_version    TEXT DEFAULT 'v1',
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_content ON media_assets(content_item_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read media_assets"
    ON media_assets FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated write media_assets"
    ON media_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── content_calendar: add tracking + linkage columns ───────────────────────
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS agent_task_id UUID
  REFERENCES agent_tasks(id) ON DELETE SET NULL;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS media_asset_id UUID
  REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS brand_version TEXT DEFAULT 'v1';
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS posted_url TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS provider_post_id TEXT;

CREATE INDEX IF NOT EXISTS idx_content_calendar_agent_task ON content_calendar(agent_task_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_media ON content_calendar(media_asset_id);
