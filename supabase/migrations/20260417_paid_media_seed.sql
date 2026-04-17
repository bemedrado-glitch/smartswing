-- SmartSwing AI — Paid Media campaign seed
-- Migration: 20260417_paid_media_seed.sql
--
-- Seeds 4 paid-media campaigns (LinkedIn, TikTok, Meta x2) with full step
-- sequences and ready-to-review ad creatives. Idempotent: re-runs skip inserted rows.

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 1 — LinkedIn Coach Lead-Gen (Q2)
-- ─────────────────────────────────────────────────────────────────────────────
WITH c AS (
  INSERT INTO marketing_campaigns
    (name, type, status, target_persona, start_date, end_date, budget, description, brief,
     is_paid_media, ad_platform, objective, daily_budget_cents, total_budget_cents)
  VALUES (
    'Q2 Coach Outreach (LinkedIn Lead Gen)',
    'paid', 'draft', 'coach',
    '2026-04-20', '2026-06-30', 1500,
    'LinkedIn lead-gen ads to USPTA/PTR certified coaches offering a free biomechanics audit of one of their players.',
    'Challenge status-quo coaching (Corporate Visions). Hook: "Your best player is leaving 10mph on their serve — and you can''t see why without biomechanics." CTA: Free 1-player audit.',
    TRUE, 'linkedin', 'leads', 2000, 150000
  )
  ON CONFLICT DO NOTHING
  RETURNING id
),
c_ref AS (
  SELECT id FROM c
  UNION ALL
  SELECT id FROM marketing_campaigns WHERE name = 'Q2 Coach Outreach (LinkedIn Lead Gen)' AND NOT EXISTS (SELECT 1 FROM c)
)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date FROM c_ref,
(VALUES
  (1, 'Audience build — USPTA/PTR coaches', 'audience_build',
    'Build a LinkedIn Matched Audience of 5,000+ profiles with titles containing ''tennis coach'', ''tennis director'', ''head pro'' and USPTA/PTR certification mentions. Exclude anyone already in marketing_contacts with stage=customer.',
    '[{"kind":"audience","spec":"LinkedIn Matched Audience, min 5,000","status":"todo"},{"kind":"exclusion_list","spec":"seed from marketing_contacts where stage=customer","status":"todo"}]',
    '2026-04-22'),
  (2, 'Landing page — /for-coaches/audit', 'landing_page',
    'One-purpose LP: ''Free Biomechanics Audit for One of Your Players''. Hero (coach + player on court), 3-step how-it-works, 1 video testimonial, 1 lead-gen form (name/email/club/NTRP level of player). Volt green CTA. Load <2s.',
    '[{"kind":"page","spec":"/for-coaches/audit","status":"todo"},{"kind":"form","spec":"5 fields, sends to marketing_contacts with source=linkedin_coach_q2","status":"todo"}]',
    '2026-04-25'),
  (3, 'Creative brief — 3 ad concepts', 'creative_brief',
    'Concept A: status-quo disruption ("Your player left 10mph on the serve"). Concept B: data proof (split-frame before/after swing). Concept C: coach-as-hero (coach using SmartSwing on iPad courtside).',
    '[{"kind":"brief_doc","spec":"3 concepts x 3 hooks each = 9 variants","status":"todo"}]',
    '2026-04-23'),
  (4, 'Ad creatives — v1 batch (9 variants)', 'ad_creative',
    'Single-image + short-video variants for each concept. Square + vertical. Copy ≤ 150 chars primary, ≤ 40 char headline.',
    '[{"kind":"image_set","spec":"3 concepts × square + 9:16","status":"todo"},{"kind":"video_set","spec":"3 concepts × 15s","status":"todo"}]',
    '2026-04-27'),
  (5, 'Pixel + conversion tracking', 'pixel_setup',
    'LinkedIn Insight Tag on all pages, conversion events: Lead (form submit), ViewContent (LP view), BookDemo (calendar click). Server-side CAPI mirror via /api/marketing/meta-conversions (reused endpoint supports LinkedIn CAPI too).',
    '[{"kind":"pixel","spec":"LinkedIn Insight Tag + CAPI","status":"todo"}]',
    '2026-04-24'),
  (6, 'Launch — $20/day × 3 concepts, 7-day learning', 'launch',
    'Launch all 3 concepts at equal budget. Auto-optimize after 50 leads or 7 days, whichever first. Kill any ad below 0.8% CTR by day 4.',
    '[{"kind":"campaign_launch","spec":"LinkedIn Ads Manager","status":"todo"}]',
    '2026-04-28'),
  (7, 'Retargeting — page viewers (7-30 day window)', 'retargeting',
    'Retarget anyone who visited /for-coaches/audit but didn''t submit the form within 7 days. Creative: case-study video from a partner coach. Budget: $5/day.',
    '[{"kind":"audience","spec":"LP viewers who did not convert","status":"todo"},{"kind":"video","spec":"Partner coach case study, 60s","status":"todo"}]',
    '2026-05-10')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
ON CONFLICT (campaign_id, step_num) DO NOTHING;

-- Ad creatives for Campaign 1
INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group
FROM marketing_campaigns mc,
(VALUES
  -- Concept A: status-quo disruption
  ('image',   'linkedin', 'feed_single',  'Your best player is leaving 10 mph on their serve',
    'Biomechanics doesn''t lie. SmartSwing AI tells you exactly where the energy leaks — in under 60 seconds from any phone video. Claim a free audit on one of your players.',
    'Free biomechanics audit · 1 player · no commitment', 'Learn more', 'A_disrupt'),
  ('video',   'linkedin', 'feed_video',   'You can see the flaw. Can you measure it?',
    'Show me a coach who doesn''t wish they had biomechanics data on their top players. SmartSwing AI turns a phone video into a 7-point biomechanics report. Free for one player of yours.',
    '15-second demo · audit is free', 'Learn more', 'A_disrupt'),
  -- Concept B: data proof
  ('image',   'linkedin', 'feed_single',  'Same swing. Two numbers your coaching eye can''t see.',
    'Hip-shoulder separation, kinetic-chain timing, racket-head speed — measured from a single phone clip. Upload one, get a biomechanics report back. Try it free on one of your players.',
    'Split-frame before/after overlay', 'Learn more', 'B_data'),
  ('carousel','linkedin', 'feed_carousel','7 metrics your player''s swing is hiding',
    'Slide 1: the swing. Slide 2-7: the metrics. Slide 8: the drill prescription. All from a 10-second phone video.',
    '7-slide carousel, metric per slide', 'Learn more', 'B_data'),
  -- Concept C: coach-as-hero
  ('image',   'linkedin', 'feed_single',  'The coach with the iPad wins. Here''s why.',
    'Your rivals are using biomechanics data you don''t have yet. SmartSwing puts an AI biomechanist in your pocket — free audit on one player to start.',
    'Courtside coach using iPad', 'Learn more', 'C_hero'),
  ('video',   'linkedin', 'feed_video',   'What a $50,000 biomechanics lab used to take all day, now runs on your phone',
    'Full-kinetic chain breakdown, hip-shoulder separation, racket-head speed — from a single 10-second clip. Coaches: claim a free audit on one of your players.',
    '30-second motion graphic reel', 'Learn more', 'C_hero')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group)
WHERE mc.name = 'Q2 Coach Outreach (LinkedIn Lead Gen)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 2 — TikTok Biomechanics Series (Spark Ads + Organic Boost)
-- ─────────────────────────────────────────────────────────────────────────────
WITH c AS (
  INSERT INTO marketing_campaigns
    (name, type, status, target_persona, start_date, end_date, budget, description, brief,
     is_paid_media, ad_platform, objective, daily_budget_cents, total_budget_cents)
  VALUES (
    'TikTok Biomechanics Series (Spark Ads)',
    'paid', 'draft', 'player',
    '2026-04-22', '2026-06-01', 800,
    '8-part TikTok educational series boosted with Spark Ads. Hook rec players (3.0-4.5 NTRP) with "secret the pros know" framing, drive to /analyze free demo.',
    'Show, don''t tell. Each episode = one biomechanics insight, one phone-video proof, one drill. Hooks in first 2 seconds. End card: "Get YOUR swing analyzed — free".',
    TRUE, 'tiktok', 'traffic', 1500, 80000
  )
  ON CONFLICT DO NOTHING
  RETURNING id
),
c_ref AS (
  SELECT id FROM c
  UNION ALL
  SELECT id FROM marketing_campaigns WHERE name = 'TikTok Biomechanics Series (Spark Ads)' AND NOT EXISTS (SELECT 1 FROM c)
)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date FROM c_ref,
(VALUES
  (1, 'Trend research (last 30 days)', 'research',
    'Pull top-performing tennis / sports-biomechanics TikToks from the last 30 days. Identify 5 hook formulas and 3 trending audio tracks that keep watch-time high.',
    '[{"kind":"research_doc","spec":"top 20 refs + hook patterns","status":"todo"}]',
    '2026-04-22'),
  (2, 'Series plan — 8 episodes', 'content_piece',
    'Ep 1: hip-shoulder separation. Ep 2: kinetic-chain timing. Ep 3: racket-head speed. Ep 4: serve pronation. Ep 5: footwork split-step. Ep 6: backhand trigger-finger grip. Ep 7: volley anticipation. Ep 8: finale — upload YOUR swing.',
    '[{"kind":"outline","spec":"8 episodes × hook + problem + proof + drill + CTA","status":"todo"}]',
    '2026-04-24'),
  (3, 'Film + edit — episodes 1-4', 'content_piece',
    '9:16, native text overlays, trending audio, captions burned in. 45-60s each. Opening 2s = specific POV hook. Outro card: "Upload your swing — link in bio".',
    '[{"kind":"video_set","spec":"4 × TikTok episodes","status":"todo"}]',
    '2026-04-29'),
  (4, 'Post episodes 1-4 organically + measure', 'launch',
    'Post on M/W/F schedule for 2 weeks. Watch 3-sec, full-watch, share, save, comment. Flag any post above 2x baseline performance for Spark Ad boost.',
    '[{"kind":"schedule","spec":"MWF × 2 weeks","status":"todo"}]',
    '2026-04-30'),
  (5, 'Spark Ad boost — top 2 episodes', 'ad_creative',
    'Promote the 2 best-performing organic episodes as Spark Ads. Creator-authored + branded. $50/day × 14 days. Optimize for LP clicks, not video views.',
    '[{"kind":"ad_spend","spec":"$50/day × 14 days × 2 posts","status":"todo"}]',
    '2026-05-06'),
  (6, 'Film + edit — episodes 5-8', 'content_piece',
    'Same structure as episodes 1-4 with learnings applied. Ep 8 finale drives hard to /analyze with time-limited code.',
    '[{"kind":"video_set","spec":"4 × TikTok episodes","status":"todo"}]',
    '2026-05-15'),
  (7, 'Retargeting pool from LP visitors', 'retargeting',
    'Anyone who clicked through to /analyze but didn''t upload a swing → retarget with Ep 8 + 15% off Player plan code. $15/day × 10 days.',
    '[{"kind":"audience","spec":"LP visitors who did not upload","status":"todo"}]',
    '2026-05-20')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
ON CONFLICT (campaign_id, step_num) DO NOTHING;

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group
FROM marketing_campaigns mc,
(VALUES
  ('short', 'tiktok', 'for_you_feed',  'POV: the reason your forehand plateaued at 4.0',
    'Hip-shoulder separation under 35° = you''re losing 8-12 mph of racket-head speed. I filmed 50 rec players. Only 6 hit the threshold. Upload your swing — AI tells you yours in 60s.',
    'Ep 1 hook — hip-shoulder', 'Learn more', 'ep1'),
  ('short', 'tiktok', 'for_you_feed',  'The 0.2 seconds that decide whether you break 4.0',
    'Kinetic chain timing. From your back foot to the racket in 0.2s or less, or you''re leaking power. AI swing analysis tells you your number. Free first report. Link in bio.',
    'Ep 2 hook — kinetic chain', 'Learn more', 'ep2'),
  ('short', 'tiktok', 'for_you_feed',  'Your serve tops out at 92 mph for a reason — and it''s not your arm',
    'Pronation. That''s it. AI biomechanics pinpoints the degree of rotation you''re missing. Free audit, phone video, 60 seconds.',
    'Ep 4 hook — serve pronation', 'Learn more', 'ep4'),
  ('short', 'tiktok', 'for_you_feed',  'I put 100 rec players through AI swing analysis. Here''s the pattern.',
    '94% had the same 3 fixable issues. Upload yours — see where you rank. Free first report, link in bio.',
    'Ep 8 finale hook', 'Sign up', 'ep8_finale')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group)
WHERE mc.name = 'TikTok Biomechanics Series (Spark Ads)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 3 — Meta Club Pilot Program (Conversion Ads)
-- ─────────────────────────────────────────────────────────────────────────────
WITH c AS (
  INSERT INTO marketing_campaigns
    (name, type, status, target_persona, start_date, end_date, budget, description, brief,
     is_paid_media, ad_platform, objective, daily_budget_cents, total_budget_cents)
  VALUES (
    'Club Pilot Program Launch (Meta Conversion)',
    'paid', 'draft', 'club',
    '2026-04-25', '2026-07-15', 2500,
    'Meta (Facebook + Instagram) conversion ads targeting club owners/tennis directors in US metro markets. Offer: 60-day free pilot for up to 20 clubs.',
    'B2B decision-makers do NOT respond to consumer ad creative. Use testimonial-first (partner club manager on camera, named with logo), case-study angle, lead form with qualifying fields (club size, coach count).',
    TRUE, 'meta', 'leads', 3000, 250000
  )
  ON CONFLICT DO NOTHING
  RETURNING id
),
c_ref AS (
  SELECT id FROM c
  UNION ALL
  SELECT id FROM marketing_campaigns WHERE name = 'Club Pilot Program Launch (Meta Conversion)' AND NOT EXISTS (SELECT 1 FROM c)
)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date FROM c_ref,
(VALUES
  (1, 'Audience build — club decision-makers', 'audience_build',
    'Meta detailed targeting: interests (USTA, tennis club management, tennis facility), job titles (director of tennis, head pro, general manager tennis club), geo: US metro areas + state suburbs. Lookalike seed: existing club customers.',
    '[{"kind":"audience","spec":"Core + Lookalike, US metros","status":"todo"}]',
    '2026-04-26'),
  (2, 'Landing page — /for-clubs/pilot', 'landing_page',
    'Pilot-specific LP. Hero: club director quote + logo. Sections: 60-day pilot details, ROI calculator, 3 partner-club case studies, lead form (club name, size, coach count, contact name, email, phone). Schema.org LocalBusiness markup.',
    '[{"kind":"page","spec":"/for-clubs/pilot","status":"todo"},{"kind":"form","spec":"6 fields, source=meta_club_pilot","status":"todo"}]',
    '2026-04-29'),
  (3, 'Creative brief — testimonial-first', 'creative_brief',
    'Concept A: video testimonial from partner club director. Concept B: ROI case study carousel. Concept C: "before SmartSwing / after SmartSwing" for the club (member retention, junior program growth).',
    '[{"kind":"brief_doc","spec":"3 concepts × 2 variants","status":"todo"}]',
    '2026-04-28'),
  (4, 'Testimonial video shoot — partner club', 'ad_creative',
    'Film at a partner club (coordinate via sales). Interview format: director speaks to camera about integration, impact on coach capacity, junior program enrollment. 60s + 30s + 15s cutdowns.',
    '[{"kind":"video_shoot","spec":"60s + 30s + 15s","status":"todo"},{"kind":"release","spec":"talent release + facility permission","status":"todo"}]',
    '2026-05-02'),
  (5, 'Meta Pixel + CAPI setup', 'pixel_setup',
    'Meta Pixel on all pages. CAPI via /api/marketing/meta-conversions (already exists). Standard events: Lead, ViewContent, CompleteRegistration. Deduplication via event_id.',
    '[{"kind":"pixel","spec":"Pixel + CAPI with event_id dedup","status":"todo"}]',
    '2026-04-27'),
  (6, 'Launch — CBO campaign, 3 ad sets', 'launch',
    'Campaign Budget Optimization. 3 ad sets: Core interests, Lookalike 1%, Lookalike 3%. $30/day total, 14-day learning phase. Kill adsets below 0.6% LP-CTR by day 7.',
    '[{"kind":"campaign_launch","spec":"Meta Ads Manager CBO","status":"todo"}]',
    '2026-05-05'),
  (7, 'Retargeting — LP viewers + form starters', 'retargeting',
    '30-day window. LP viewer who did not submit: retarget with ROI calculator video. Form starter who did not complete: retarget with "5-minute pilot Q&A" offer.',
    '[{"kind":"audience","spec":"LP viewers + form starters","status":"todo"},{"kind":"video","spec":"ROI + 5-min Q&A","status":"todo"}]',
    '2026-05-20')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
ON CONFLICT (campaign_id, step_num) DO NOTHING;

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group
FROM marketing_campaigns mc,
(VALUES
  ('video',    'meta', 'feed_video',       'How Westchester Tennis added 31% to their junior program',
    'Director Jordan M. walks through the 60-day pilot: what they deployed, what their coaches said, what the numbers did. 20 clubs qualify this quarter. Apply for yours.',
    'Testimonial video, 60s',
    'Apply now', 'A_testimonial'),
  ('video',    'meta', 'reels',            '60 days. Zero cost. Full biomechanics for every player in your program.',
    'Our club pilot program: free 60 days, up to 20 clubs per quarter. See the Westchester result — +31% juniors, +22% coach capacity. Limited slots — apply now.',
    'Short vertical cut, 30s',
    'Apply now', 'A_testimonial'),
  ('carousel', 'meta', 'feed_carousel',    'The 5-slide club ROI breakdown',
    'Slide 1: the 60-day pilot. 2: the setup (2 hours). 3: the coach capacity math. 4: the retention impact. 5: how to apply.',
    '5-slide carousel with ROI math',
    'Apply now', 'B_roi'),
  ('image',    'meta', 'feed_single',      'Before SmartSwing: 1 coach per 6 students. After: 1 per 14.',
    'Every club director wants the same thing: more capacity without more hiring. That''s what biomechanics AI delivers. See the pilot terms.',
    'Clean data visualization, 1:1',
    'Learn more', 'C_before_after')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group)
WHERE mc.name = 'Club Pilot Program Launch (Meta Conversion)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 4 — Meta Trial Conversion Push (Retargeting)
-- ─────────────────────────────────────────────────────────────────────────────
WITH c AS (
  INSERT INTO marketing_campaigns
    (name, type, status, target_persona, start_date, end_date, budget, description, brief,
     is_paid_media, ad_platform, objective, daily_budget_cents, total_budget_cents)
  VALUES (
    'Trial Conversion Push (Meta Retargeting)',
    'paid', 'draft', 'player',
    '2026-04-18', '2026-05-31', 900,
    'Retargeting on Meta (FB + IG) for Player Plan 90-day trial users who have not converted. Push the second-report unlock as the "moment it clicks" CTA.',
    'Trial users need a SECOND report to see improvement. Creative shows before/after of one of their own metrics. Offer: 20% off first 3 months if they upgrade in the next 48h.',
    TRUE, 'meta', 'conversions', 1500, 90000
  )
  ON CONFLICT DO NOTHING
  RETURNING id
),
c_ref AS (
  SELECT id FROM c
  UNION ALL
  SELECT id FROM marketing_campaigns WHERE name = 'Trial Conversion Push (Meta Retargeting)' AND NOT EXISTS (SELECT 1 FROM c)
)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date FROM c_ref,
(VALUES
  (1, 'Audience build — active trial users', 'audience_build',
    'Custom audience: users with subscription_tier=starter AND created_at > NOW()-interval ''90 days'' AND no paid upgrade. Exclude: already-paid, opted out, churned. Updated daily via Meta Custom Audience API.',
    '[{"kind":"audience","spec":"Trial users, daily refresh","status":"todo"}]',
    '2026-04-18'),
  (2, 'Creative — dynamic personalized "your second report" variants', 'creative_brief',
    '3 concepts. A: before/after of their own metric (requires dynamic creative API). B: social proof — "players like you upgraded after their 2nd report". C: urgency — "20% off expires in 48 hours".',
    '[{"kind":"brief_doc","spec":"3 concepts","status":"todo"}]',
    '2026-04-18'),
  (3, 'Ad creatives — 6 variants', 'ad_creative',
    'Static + short-video. Copy tight: ≤ 90 chars primary, ≤ 30 char headline. CTA: "Upgrade now" for urgency variant, "See my progress" for personal variants.',
    '[{"kind":"image_set","spec":"3 concepts × square + 9:16","status":"todo"},{"kind":"video_set","spec":"3 concepts × 10s","status":"todo"}]',
    '2026-04-21'),
  (4, 'Pixel events — trial → paid conversion', 'pixel_setup',
    'Custom event UpgradeTrial fires on payment-success.html for previous-tier=starter AND new-tier=pro/elite. Attributed back to ad click via fbclid stored in session.',
    '[{"kind":"pixel","spec":"UpgradeTrial custom conversion","status":"todo"}]',
    '2026-04-19'),
  (5, 'Launch — $30/day, 48h learning', 'launch',
    'Single retargeting campaign, CBO. Optimize for UpgradeTrial conversion event. 48h learning, then automated rules (scale +20% daily if CPA < $40, pause ad if CPA > $60).',
    '[{"kind":"campaign_launch","spec":"Meta retargeting","status":"todo"}]',
    '2026-04-22'),
  (6, 'Weekly creative refresh', 'content_piece',
    'Refresh top-performing variants every 7 days to avoid ad fatigue (trial audience is small, frequency climbs fast). Swap social-proof testimonials weekly.',
    '[{"kind":"refresh_cadence","spec":"weekly","status":"todo"}]',
    '2026-04-29')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
ON CONFLICT (campaign_id, step_num) DO NOTHING;

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group
FROM marketing_campaigns mc,
(VALUES
  ('image', 'meta', 'feed_single', 'Your swing is changing. See the proof.',
    'Run your second swing analysis — it''s free. Compare to your first. See the drill that worked. 20% off Player upgrade if you go in 48h.',
    'Before/after split of user''s own metric', 'See my progress', 'A_personal'),
  ('video', 'meta', 'reels',       'The second report is the one that changes everything',
    'Your first report found the leaks. Your second proves the drills worked. Upgrade and unlock unlimited reports — 20% off the first 3 months.',
    'Short motion graphic, 10s', 'Upgrade now', 'B_unlock'),
  ('image', 'meta', 'feed_single', 'Players like you upgraded after their second report',
    '82% of players who uploaded 2+ swings upgraded to Player within 30 days. Not because of a discount. Because they saw the progress.',
    'Social proof stat + player avatar cluster', 'Upgrade now', 'C_social'),
  ('image', 'meta', 'story',       '48 hours. 20% off. Player plan.',
    'Your trial progress deserves more than one report. Upgrade in the next 48h — 20% off Player plan, first 3 months.',
    'Urgency counter visual', 'Upgrade now', 'D_urgency')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group)
WHERE mc.name = 'Trial Conversion Push (Meta Retargeting)'
ON CONFLICT DO NOTHING;
