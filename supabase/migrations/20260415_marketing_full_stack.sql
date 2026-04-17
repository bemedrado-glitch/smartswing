-- SmartSwing AI — Marketing tool "full stack" migration
-- Supports Sprint 1-4 tickets: template library, short-link attribution,
-- per-campaign drill-down fields, persona rails, image error surfacing,
-- approval gate, and live metric refresh.

-- ─── Ticket #6: persisted viral template library ───────────────────────────
CREATE TABLE IF NOT EXISTS content_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        TEXT NOT NULL,                -- instagram | facebook | linkedin | twitter | tiktok | youtube | email | sms
  format          TEXT NOT NULL,                -- reel | carousel | thread | story | single_post | email | sms
  persona         TEXT,                         -- player | coach | club | parent | null = universal
  sport           TEXT DEFAULT 'tennis',        -- tennis | pickleball | both
  hook            TEXT NOT NULL,                -- a template hook with {placeholders}
  body_structure  TEXT,                         -- structural notes/instructions
  cta             TEXT,                         -- suggested call-to-action
  placeholders    JSONB DEFAULT '[]'::jsonb,    -- e.g. ["metric","player_level","drill_name"]
  avg_engagement  NUMERIC DEFAULT NULL,         -- rolling engagement rate if we've used it
  usage_count     INT DEFAULT 0,
  wins_count      INT DEFAULT 0,                -- times it produced a top-decile post
  source          TEXT DEFAULT 'handcurated',   -- handcurated | ai_suggested | reverse_engineered
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  active          BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS content_templates_platform_idx ON content_templates(platform, persona, active);
COMMENT ON TABLE content_templates IS 'Persisted library of proven viral templates used to guide copywriter agents.';

-- ─── Ticket #9: short-link attribution ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS short_links (
  code          TEXT PRIMARY KEY,
  target_url    TEXT NOT NULL,
  campaign_id   UUID,
  content_item_id UUID,
  platform      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS short_link_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL,
  clicked_at    TIMESTAMPTZ DEFAULT NOW(),
  user_agent    TEXT,
  referrer      TEXT,
  utm_source    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT
);
CREATE INDEX IF NOT EXISTS short_link_clicks_code_idx ON short_link_clicks(code, clicked_at DESC);

-- ─── Ticket #12: surface image generation errors ───────────────────────────
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS image_error TEXT DEFAULT NULL;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS target_persona TEXT DEFAULT NULL;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS brand_version TEXT DEFAULT 'v1';
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS clicks INT DEFAULT 0;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS conversions INT DEFAULT 0;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';

-- ─── Ticket #9: RPC for counting clicks per content item ───────────────────
CREATE OR REPLACE FUNCTION increment_content_clicks(item_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE content_calendar SET clicks = COALESCE(clicks, 0) + 1 WHERE id = item_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Seed: 25 proven viral templates for tennis & pickleball ───────────────
INSERT INTO content_templates (platform, format, persona, sport, hook, body_structure, cta, placeholders, source, tags) VALUES
-- LinkedIn (B2B — coaches & clubs)
('linkedin', 'single_post', 'coach', 'both',
 'I watched {number} swings this week. {percent}% had the same flaw.',
 'Open with the data. Name the flaw in one line. Explain why most coaches miss it. 3-step fix. Close with an observation, not a pitch.',
 'Comment with your biggest forehand tell.',
 '["number","percent"]', 'handcurated', ARRAY['data','authority','contrarian']),
('linkedin', 'carousel', 'club', 'tennis',
 '7 things our member-retention dashboard taught us about programming.',
 'Slide 1 hook. Slides 2-8 one insight each with a number. Slide 9 lesson. Slide 10 CTA.',
 'DM us to see the dashboard template.',
 '[]', 'handcurated', ARRAY['retention','b2b','framework']),
('linkedin', 'single_post', 'coach', 'both',
 'A {level} player came in convinced their backhand was the problem. It was their footwork.',
 'Story beat 1: initial belief. Beat 2: what the video showed. Beat 3: the 10-minute fix. Lesson for the reader.',
 'What assumption did you correct this month?',
 '["level"]', 'handcurated', ARRAY['story','teachable']),

-- Instagram Reels (visual-first, all personas)
('instagram', 'reel', 'player', 'tennis',
 'Your forehand lands late by {ms} milliseconds. Here''s why.',
 '0-1s: freeze frame at contact. 1-3s: slow-mo explanation. 3-15s: the fix drill. 15-20s: before/after. 20-25s: CTA.',
 'Save this and try it today.',
 '["ms"]', 'handcurated', ARRAY['biomechanics','specific','save-worthy']),
('instagram', 'reel', 'player', 'pickleball',
 'Stop popping up your dink. Do this instead.',
 '0-2s: pattern interrupt — the error. 2-10s: the fix with paddle angle cue. 10-20s: progression drill.',
 'Follow for one dink fix a day.',
 '[]', 'handcurated', ARRAY['pickleball','fix','daily-hook']),
('instagram', 'carousel', 'parent', 'tennis',
 '5 signs your junior is ready to compete.',
 'Slide 1 hook. 5 signs, one per slide. Slide 7 tie-breaker. Slide 8 CTA.',
 'Save for the next tournament decision.',
 '[]', 'handcurated', ARRAY['parents','checklist']),
('instagram', 'carousel', 'player', 'tennis',
 'I added {unit} to my serve in {days} days. Here''s the plan.',
 'Slide 1 hook with numbers. Slides 2-7 one week each. Slide 8 data. Slide 9 mindset. Slide 10 CTA.',
 'Comment "plan" and I''ll DM it.',
 '["unit","days"]', 'handcurated', ARRAY['transformation','proof']),

-- Facebook (community, longer)
('facebook', 'single_post', 'club', 'tennis',
 '{club_name} members: we changed one thing about Monday drills. Attendance doubled.',
 'Before/after. The change. Why it worked for us. Invite discussion.',
 'Which night do you run your strongest drill?',
 '["club_name"]', 'handcurated', ARRAY['community','local']),

-- X / Twitter threads (tech-savvy, niche)
('twitter', 'thread', 'coach', 'both',
 '{number} pricing mistakes that cost me ${amount} as a coach:',
 'Hook tweet with number. 5-7 mistakes, one per tweet, specific. Final tweet with lesson + follow CTA.',
 'Follow for one coaching-business insight a day.',
 '["number","amount"]', 'handcurated', ARRAY['business','vulnerable']),
('twitter', 'single', 'player', 'tennis',
 'Your racket face is open on contact. That''s why the ball floats long.',
 'One insight, under 180 chars. Include the fix.',
 NULL,
 '[]', 'handcurated', ARRAY['quick-win']),

-- TikTok (entertainment wrapper)
('tiktok', 'reel', 'player', 'tennis',
 'POV: your coach finally tells you what "use your legs" actually means.',
 '0-2s: POV text. 2-5s: wrong form side-by-side. 5-15s: the actual cue. 15-25s: try it yourself callout.',
 'Comment the cue your coach repeats every lesson.',
 '[]', 'handcurated', ARRAY['pov','trend-compatible']),
('tiktok', 'reel', 'player', 'pickleball',
 '3 ways you''re losing the kitchen line without knowing it.',
 '0-2s: hook with count. 3 clips, one per mistake. Recap card.',
 'Part 2 when this hits 10K.',
 '[]', 'handcurated', ARRAY['listicle','viral-structure']),

-- Email / cadence
('email', 'email', 'player', 'tennis',
 'The 47-second drill that fixed my {shot}',
 'P1 hook + stat. P2 setup. P3 the drill in 3 steps. P4 result. P5 soft CTA.',
 'Try it and hit reply with a video — I''ll give you one note back.',
 '["shot"]', 'handcurated', ARRAY['direct-response','high-open']),
('email', 'email', 'club', 'tennis',
 'We analyzed {number} member swings. Your club is leaving {percent}% retention on the table.',
 'Bold stat. Why it matters for clubs. What top clubs do differently. Soft CTA to book a call.',
 'Reply "send me the analysis" for a free benchmark report.',
 '["number","percent"]', 'handcurated', ARRAY['b2b-outreach','insight-led']),

-- YouTube (long-form authority)
('youtube', 'video', 'player', 'tennis',
 'The forehand fix pros use that rec players never learn.',
 '0-15s cold open showing the move. 15-30s why rec players miss it. 30s-3min the progression. 3-5min common mistakes. 5min CTA.',
 'Subscribe for weekly biomechanics breakdowns.',
 '[]', 'handcurated', ARRAY['authority','tutorial']),

-- Contrarian / authority (LinkedIn + X)
('linkedin', 'single_post', 'coach', 'both',
 'Stop telling players to "watch the ball". It''s the worst cue in tennis.',
 'Bold claim. Why it''s wrong. What to cue instead. Invite disagreement.',
 'Agree or disagree? Tell me why.',
 '[]', 'handcurated', ARRAY['contrarian','engagement']),
('linkedin', 'single_post', 'club', 'both',
 'Every club I tour has the same 3 programming gaps. Here they are.',
 'List the 3 gaps. One concrete fix each. Close with why most clubs never close them.',
 'Which gap hurts your club most?',
 '[]', 'handcurated', ARRAY['b2b','audit']),

-- Story-driven
('instagram', 'reel', 'player', 'tennis',
 'I was a 3.5 for 4 years. One drill took me to 4.5 in 11 months.',
 '0-2s old footage. 2-8s the stagnation. 8-20s the drill. 20-30s new footage.',
 'DM "plan" for the 11-month schedule.',
 '[]', 'handcurated', ARRAY['transformation','dm-trigger']),

-- Educational carousel
('instagram', 'carousel', 'coach', 'both',
 '{number} cues I stopped using with {level} players (and what I say instead).',
 'Hook. Each slide: old cue → new cue → why. CTA.',
 'Save and send to your co-coach.',
 '["number","level"]', 'handcurated', ARRAY['professional','save-worthy']),

-- Quick-tip
('twitter', 'single', 'player', 'pickleball',
 'Pickleball is chess at the kitchen, chase at the baseline. Know which game you''re in.',
 NULL, NULL, '[]', 'handcurated', ARRAY['aphorism','quotable']),

-- Event / local
('facebook', 'single_post', 'club', 'tennis',
 '{day} social mixer — {openings} spots left. Mixed doubles, all levels, {price}.',
 'What it is. Who it''s for. How to sign up.',
 'Reply "in" to reserve.',
 '["day","openings","price"]', 'handcurated', ARRAY['event','local']),

-- Pickleball authority
('linkedin', 'single_post', 'club', 'pickleball',
 'Pickleball grew {percent}% at our club this year. 4 things we changed.',
 'Data. 4 changes. One line on cost. One line on impact.',
 'DM for the programming breakdown.',
 '["percent"]', 'handcurated', ARRAY['growth','data']),

-- Parent emotional
('instagram', 'carousel', 'parent', 'tennis',
 'What your junior actually needs at {age} (it''s not more lessons).',
 'Hook. 6 slides of needs with evidence. CTA.',
 'Save. Share with another tennis parent.',
 '["age"]', 'handcurated', ARRAY['parents','emotional']),

-- Coach business
('linkedin', 'single_post', 'coach', 'both',
 'I raised my hourly rate from ${old} to ${new}. Here''s the email I sent my roster.',
 'The fear. The email structure (3 paragraphs). The response.',
 'Want the template? Comment "rates".',
 '["old","new"]', 'handcurated', ARRAY['business','vulnerable','template']),

-- Drill-of-the-day
('instagram', 'reel', 'player', 'tennis',
 'Drill of the day: the {name}. Builds {skill} in 12 reps.',
 '0-2s: name + reps. 2-15s: slow demo with cues. 15-25s: variations. 25-30s: CTA.',
 'Follow for a drill every day.',
 '["name","skill"]', 'handcurated', ARRAY['series','daily']);
