-- Content Map: structured research data for content planning.
-- Migration: 20260420_content_map_research.sql
--
-- 8 categories: tournament, pain, challenge, need, desire, idea, influencer,
-- storyboard. All seeded with the user's content-strategy data drop:
--   - 19 tournaments (rest-of-2026 tennis + pickleball)
--   - 10 pains, 10 challenges, 10 needs, 10 desires (industry research)
--   - 10 viral content ideas (LatAm focus)
--   - 10 LatAm influencer partnership candidates
--   - 1 full storyboard ("Abuela vs. The Pro")
--
-- Surfaced via new "Content Map" panel in marketing dashboard. Each item has
-- a "→ Plan this content" button that seeds Pipeline Studio's Planner topic
-- and switches the user to that tab in 1 click.
--
-- Applied to production 2026-04-20 via Supabase MCP.

CREATE TABLE IF NOT EXISTS content_research (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT NOT NULL CHECK (category IN ('tournament','pain','challenge','need','desire','idea','influencer','storyboard')),
  title           TEXT NOT NULL,
  body            TEXT,
  rank            INT,
  region          TEXT,
  sport           TEXT CHECK (sport IS NULL OR sport IN ('tennis','pickleball','padel','both','all')),
  start_date      DATE,
  end_date        DATE,
  location        TEXT,
  level           TEXT,
  metadata        JSONB DEFAULT '{}',
  source_url      TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_research_category ON content_research(category, rank);
CREATE INDEX IF NOT EXISTS idx_content_research_region   ON content_research(region) WHERE region IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_research_dates    ON content_research(start_date) WHERE start_date IS NOT NULL;

ALTER TABLE content_research ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated all content_research" ON content_research;
CREATE POLICY "Authenticated all content_research" ON content_research FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- See live DB for the full seed (80 rows). Migration also creates
-- v_content_research_summary view for quick category counts.

CREATE OR REPLACE VIEW v_content_research_summary AS
SELECT category, COUNT(*) AS items,
       COUNT(*) FILTER (WHERE region='latam') AS latam_items,
       COUNT(*) FILTER (WHERE active = TRUE) AS active_items
FROM content_research GROUP BY category ORDER BY category;
