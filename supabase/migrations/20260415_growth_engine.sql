-- Growth Engine expansion (Phase F)
-- Lead scoring, content metrics, A/B hooks, share cards, weekly digest, utm bridge

-- ── Lead scoring & attribution ─────────────────────────────────────────────
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS utm_source   TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_score ON marketing_contacts(lead_score DESC);

-- ── profiles ← utm bridge ──────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS utm_source   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS utm_medium   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- ── Content metrics (per-post performance pulled from Meta / etc.) ────────
CREATE TABLE IF NOT EXISTS content_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_calendar(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  provider_post_id TEXT,
  impressions     INT DEFAULT 0,
  reach           INT DEFAULT 0,
  likes           INT DEFAULT 0,
  comments        INT DEFAULT 0,
  shares          INT DEFAULT 0,
  saves           INT DEFAULT 0,
  clicks          INT DEFAULT 0,
  video_views     INT DEFAULT 0,
  engagement_rate NUMERIC(6,3),
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw             JSONB
);
CREATE INDEX IF NOT EXISTS idx_content_metrics_item ON content_metrics(content_item_id, fetched_at DESC);

ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated read content_metrics"
    ON content_metrics FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated write content_metrics"
    ON content_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── A/B hook variants + winner tracking ───────────────────────────────────
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS hook_variants JSONB;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS winning_variant_index INT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS variant_decided_at TIMESTAMPTZ;

-- ── Public share-card slug ────────────────────────────────────────────────
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_calendar_slug ON content_calendar(slug) WHERE slug IS NOT NULL;

-- ── Weekly digest log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_digests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  DATE NOT NULL,
  summary     JSONB NOT NULL,
  sent_to     TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_digests_week ON weekly_digests(week_start);
ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated read weekly_digests"
    ON weekly_digests FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Publish retry counter ─────────────────────────────────────────────────
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS failure_count INT DEFAULT 0;

-- ── inbox_messages: surface DM/replies from Meta webhook ──────────────────
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS source_platform TEXT;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS source_provider_id TEXT;
