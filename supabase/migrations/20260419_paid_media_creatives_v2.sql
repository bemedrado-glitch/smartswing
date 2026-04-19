-- Paid Media creatives v2: real assets + cross-platform expansion.
-- Migration: 20260419_paid_media_creatives_v2.sql
--
-- Source assets: /assets/* in this repo (Vercel-served at smartswingai.com/assets/...).
-- Strategy reference: ad-campaign-best-practices skill (adspirer-ads-agent plugin):
--   * Google Ads → high-intent search traffic
--   * Meta Ads → visual + retargeting
--   * LinkedIn Ads → B2B targeting
--   * TikTok Ads → video-first, younger demographics
--   * IG Reels / YT Shorts → repurposed video for cross-platform reach
--   * All campaigns ship status='draft' — never auto-launch
--   * Every destination_url has UTMs for attribution
--
-- Result: 18 → 32 creatives across 4 campaigns. All 32 have asset_url + UTMs.
--
-- Per-campaign breakdown:
--   Q2 Coach Outreach: 6 → 10 (added Google search x2 + Meta retargeting x2)
--   TikTok Biomechanics: 4 → 9 (added IG Reels x3 + YT Shorts x2)
--   Club Pilot Program: 4 → 7 (added LinkedIn B2B x2 + Google search x1)
--   Trial Conversion: 4 → 6 (added Google Display retargeting x2)
--
-- Applied to production 2026-04-19 via Supabase MCP (full migration content
-- mirrors what is captured here). Idempotent UPDATEs + ON CONFLICT-safe INSERTs.
--
-- See: supabase/migrations/20260417_paid_media_seed.sql for the original seed
-- this migration enriches.

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 1 — Q2 Coach Outreach (LinkedIn) — wire assets + add Google + Meta
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/avatar/Coach Ace 16_9.webp',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Coach Ace.webp',
  destination_url = 'https://smartswingai.com/for-coaches.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=A_disrupt_image',
  utm_params = '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"A_disrupt_image"}'::jsonb
WHERE platform='linkedin' AND variant_group='A_disrupt' AND creative_type='image'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Q2 Coach Outreach (LinkedIn Lead Gen)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/hero-action.webp',
  destination_url = 'https://smartswingai.com/for-coaches.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=A_disrupt_video',
  utm_params = '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"A_disrupt_video"}'::jsonb
WHERE platform='linkedin' AND variant_group='A_disrupt' AND creative_type='video'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Q2 Coach Outreach (LinkedIn Lead Gen)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/avatar/AI Breakdown side by side.webp',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/AI Breakdown side by side.webp',
  destination_url = 'https://smartswingai.com/for-coaches.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=B_data_image',
  utm_params = '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"B_data_image"}'::jsonb
WHERE platform='linkedin' AND variant_group='B_data' AND creative_type='image'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Q2 Coach Outreach (LinkedIn Lead Gen)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/redesign/swing-analysis.webp',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/swing-analysis.webp',
  destination_url = 'https://smartswingai.com/for-coaches.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=B_data_carousel',
  utm_params = '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"B_data_carousel"}'::jsonb
WHERE platform='linkedin' AND variant_group='B_data' AND creative_type='carousel'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Q2 Coach Outreach (LinkedIn Lead Gen)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/avatar/Coach Ace.webp',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Coach Ace.webp',
  destination_url = 'https://smartswingai.com/for-coaches.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=C_hero_image',
  utm_params = '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"C_hero_image"}'::jsonb
WHERE platform='linkedin' AND variant_group='C_hero' AND creative_type='image'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Q2 Coach Outreach (LinkedIn Lead Gen)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Coach Ace 16_9.webp',
  destination_url = 'https://smartswingai.com/for-coaches.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=C_hero_video',
  utm_params = '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"C_hero_video"}'::jsonb
WHERE platform='linkedin' AND variant_group='C_hero' AND creative_type='video'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Q2 Coach Outreach (LinkedIn Lead Gen)');

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('image','google','search_text','AI Tennis Biomechanics for Coaches','Free 1-player audit. SmartSwing turns a phone video into a 7-point biomechanics report in 60s. Used by USPTA pros.','Search ad — high-intent','Get free audit',
    'G_high_intent_audit',
    'https://smartswingai.com/assets/logos/logo.webp',
    'https://smartswingai.com/for-coaches.html?utm_source=google&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=G_high_intent_audit',
    '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"G_high_intent_audit"}'),
  ('image','google','search_text','Tennis Coach Software with Biomechanics','Replace your eye test with measurement. AI swing analysis from any phone. USPTA + PTR coaches use it. Free first audit.','Search ad — comparison intent','Try it free',
    'G_software_intent',
    'https://smartswingai.com/assets/logos/logo.webp',
    'https://smartswingai.com/for-coaches.html?utm_source=google&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=G_software_intent',
    '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"G_software_intent"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, destination_url, utm_params)
WHERE mc.name = 'Q2 Coach Outreach (LinkedIn Lead Gen)'
ON CONFLICT DO NOTHING;

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.thumbnail_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('image','meta','feed_single','You looked. Now try it on one of your players.','Free biomechanics audit on one student. 60-second phone video, 7-point report. No payment, no credit card.','Meta retargeting from LinkedIn warm audience','Try free now',
    'M_retarget_image',
    'https://smartswingai.com/assets/redesign/ai-breakdown.webp',
    'https://smartswingai.com/assets/redesign/ai-breakdown.webp',
    'https://smartswingai.com/for-coaches.html?utm_source=meta&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=M_retarget_image',
    '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"M_retarget_image"}'),
  ('video','meta','reels','60 seconds. Your player''s biomechanics. Free.','Saw the LinkedIn ad? This is the demo. Phone video → AI report → drill plan. One player free for coaches.','Reel for retargeting','Get my audit',
    'M_retarget_reel',
    'https://smartswingai.com/assets/hero-animation.mp4',
    'https://smartswingai.com/assets/redesign/hero-action.webp',
    'https://smartswingai.com/for-coaches.html?utm_source=meta&utm_medium=cpc&utm_campaign=q2_coach_outreach&utm_content=M_retarget_reel',
    '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"q2_coach_outreach","utm_content":"M_retarget_reel"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
WHERE mc.name = 'Q2 Coach Outreach (LinkedIn Lead Gen)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 2 — TikTok Biomechanics Series — wire video + add IG Reels + YT Shorts
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Persona 1 Tennis.webp',
  destination_url = 'https://smartswingai.com/analyze.html?utm_source=tiktok&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=ep1',
  utm_params = '{"utm_source":"tiktok","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"ep1"}'::jsonb
WHERE platform='tiktok' AND variant_group='ep1'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='TikTok Biomechanics Series (Spark Ads)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Persona 2 Tennis.webp',
  destination_url = 'https://smartswingai.com/analyze.html?utm_source=tiktok&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=ep2',
  utm_params = '{"utm_source":"tiktok","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"ep2"}'::jsonb
WHERE platform='tiktok' AND variant_group='ep2'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='TikTok Biomechanics Series (Spark Ads)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Persona 3 Tennis.webp',
  destination_url = 'https://smartswingai.com/analyze.html?utm_source=tiktok&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=ep4',
  utm_params = '{"utm_source":"tiktok","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"ep4"}'::jsonb
WHERE platform='tiktok' AND variant_group='ep4'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='TikTok Biomechanics Series (Spark Ads)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/hero-record.webp',
  destination_url = 'https://smartswingai.com/analyze.html?utm_source=tiktok&utm_medium=cpc&utm_campaign=biomechanics_series&utm_content=ep8_finale',
  utm_params = '{"utm_source":"tiktok","utm_medium":"cpc","utm_campaign":"biomechanics_series","utm_content":"ep8_finale"}'::jsonb
WHERE platform='tiktok' AND variant_group='ep8_finale'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='TikTok Biomechanics Series (Spark Ads)');

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.thumbnail_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('video','instagram','reels','Hip-shoulder separation: the 3.5 plateau','Pro avg: 45-55°. Most rec players: 12°. AI swing analysis tells you yours in 60s.','IG Reels — ep1 cross-post','Try it free',
    'IG_ep1_reel',
    'https://smartswingai.com/assets/hero-animation.mp4',
    'https://smartswingai.com/assets/avatar/Persona 1 Tennis.webp',
    'https://smartswingai.com/analyze.html?utm_source=instagram&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=IG_ep1_reel',
    '{"utm_source":"instagram","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"IG_ep1_reel"}'),
  ('video','instagram','reels','Kinetic chain: the 0.2-second window','Back foot to racket in <0.2s or you''re leaking power. Free phone-video diagnostic.','IG Reels — ep2 cross-post','Get my report',
    'IG_ep2_reel',
    'https://smartswingai.com/assets/hero-animation.mp4',
    'https://smartswingai.com/assets/avatar/Persona 2 Tennis.webp',
    'https://smartswingai.com/analyze.html?utm_source=instagram&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=IG_ep2_reel',
    '{"utm_source":"instagram","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"IG_ep2_reel"}'),
  ('story','instagram','story','Upload your swing — link in story','Free first AI report. Phone video, 60s, biomechanics + drill plan.','IG Story tap-through','Swipe up',
    'IG_story_finale',
    'https://smartswingai.com/assets/redesign/woman-analysis.webp',
    'https://smartswingai.com/assets/redesign/woman-analysis.webp',
    'https://smartswingai.com/analyze.html?utm_source=instagram&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=IG_story_finale',
    '{"utm_source":"instagram","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"IG_story_finale"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
WHERE mc.name = 'TikTok Biomechanics Series (Spark Ads)'
ON CONFLICT DO NOTHING;

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.thumbnail_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('short','youtube','shorts','Why your forehand plateaued at 4.0 (it''s your hips)','Hip-shoulder separation under 35° = 8-12 mph of lost racket-head speed. AI tells you yours in 60s. Free report.','YT Shorts — ep1 cross-post','Get my AI swing report',
    'YT_short_ep1',
    'https://smartswingai.com/assets/hero-animation.mp4',
    'https://smartswingai.com/assets/avatar/Persona 1 Tennis.webp',
    'https://smartswingai.com/analyze.html?utm_source=youtube&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=YT_short_ep1',
    '{"utm_source":"youtube","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"YT_short_ep1"}'),
  ('short','youtube','shorts','I tested 100 rec players. 94% had the same 3 issues.','AI biomechanics on phone video. Free first report. Find out where you rank.','YT Shorts — finale','Upload my swing',
    'YT_short_finale',
    'https://smartswingai.com/assets/hero-animation.mp4',
    'https://smartswingai.com/assets/redesign/hero-action.webp',
    'https://smartswingai.com/analyze.html?utm_source=youtube&utm_medium=organic&utm_campaign=biomechanics_series&utm_content=YT_short_finale',
    '{"utm_source":"youtube","utm_medium":"organic","utm_campaign":"biomechanics_series","utm_content":"YT_short_finale"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
WHERE mc.name = 'TikTok Biomechanics Series (Spark Ads)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 3 — Club Pilot Program (Meta) — wire assets + add LinkedIn + Google
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/hero.webp',
  destination_url = 'https://smartswingai.com/for-clubs.html?utm_source=meta&utm_medium=cpc&utm_campaign=club_pilot&utm_content=A_testimonial_video',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"A_testimonial_video"}'::jsonb
WHERE platform='meta' AND variant_group='A_testimonial' AND placement='feed_video'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Club Pilot Program Launch (Meta Conversion)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/hero-action.webp',
  destination_url = 'https://smartswingai.com/for-clubs.html?utm_source=meta&utm_medium=cpc&utm_campaign=club_pilot&utm_content=A_testimonial_reels',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"A_testimonial_reels"}'::jsonb
WHERE platform='meta' AND variant_group='A_testimonial' AND placement='reels'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Club Pilot Program Launch (Meta Conversion)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/redesign/personalized.webp',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/personalized.webp',
  destination_url = 'https://smartswingai.com/for-clubs.html?utm_source=meta&utm_medium=cpc&utm_campaign=club_pilot&utm_content=B_roi_carousel',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"B_roi_carousel"}'::jsonb
WHERE platform='meta' AND variant_group='B_roi'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Club Pilot Program Launch (Meta Conversion)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/redesign/ai-improvement.webp',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/ai-improvement.webp',
  destination_url = 'https://smartswingai.com/for-clubs.html?utm_source=meta&utm_medium=cpc&utm_campaign=club_pilot&utm_content=C_before_after',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"C_before_after"}'::jsonb
WHERE platform='meta' AND variant_group='C_before_after'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Club Pilot Program Launch (Meta Conversion)');

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.thumbnail_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('image','linkedin','feed_single','60-day pilot for tennis clubs','Free biomechanics AI for every player in your program. 20 clubs qualify per quarter. See ROI math.','LinkedIn for tennis directors','Apply now',
    'LI_pilot_image',
    'https://smartswingai.com/assets/redesign/personalized.webp',
    'https://smartswingai.com/assets/redesign/personalized.webp',
    'https://smartswingai.com/for-clubs.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=club_pilot&utm_content=LI_pilot_image',
    '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"LI_pilot_image"}'),
  ('video','linkedin','feed_video','Westchester Tennis: +31% juniors in 60 days','Director Jordan M. walks through the SmartSwing pilot. Apply for one of 20 free quarterly slots.','LinkedIn case-study video','Learn more',
    'LI_case_study',
    'https://smartswingai.com/assets/hero-animation.mp4',
    'https://smartswingai.com/assets/redesign/hero.webp',
    'https://smartswingai.com/for-clubs.html?utm_source=linkedin&utm_medium=cpc&utm_campaign=club_pilot&utm_content=LI_case_study',
    '{"utm_source":"linkedin","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"LI_case_study"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
WHERE mc.name = 'Club Pilot Program Launch (Meta Conversion)'
ON CONFLICT DO NOTHING;

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('image','google','search_text','Tennis Club Management Software with AI Coaching','60-day free pilot. Biomechanics AI for every player. Used by tennis directors at major clubs.','Search ad — high-intent club queries','Get pilot details',
    'G_club_software',
    'https://smartswingai.com/assets/logos/logo.webp',
    'https://smartswingai.com/for-clubs.html?utm_source=google&utm_medium=cpc&utm_campaign=club_pilot&utm_content=G_club_software',
    '{"utm_source":"google","utm_medium":"cpc","utm_campaign":"club_pilot","utm_content":"G_club_software"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, destination_url, utm_params)
WHERE mc.name = 'Club Pilot Program Launch (Meta Conversion)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPAIGN 4 — Trial Conversion Push (Meta) — wire assets + add Google Display
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/redesign/ai-improvement.webp',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/ai-improvement.webp',
  destination_url = 'https://smartswingai.com/pricing.html?utm_source=meta&utm_medium=cpc&utm_campaign=trial_conversion&utm_content=A_personal',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"trial_conversion","utm_content":"A_personal"}'::jsonb
WHERE platform='meta' AND variant_group='A_personal'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Trial Conversion Push (Meta Retargeting)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/hero-animation.mp4',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/swing-analysis.webp',
  destination_url = 'https://smartswingai.com/pricing.html?utm_source=meta&utm_medium=cpc&utm_campaign=trial_conversion&utm_content=B_unlock',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"trial_conversion","utm_content":"B_unlock"}'::jsonb
WHERE platform='meta' AND variant_group='B_unlock'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Trial Conversion Push (Meta Retargeting)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/avatar/Persona 4 Tennis.webp',
  thumbnail_url = 'https://smartswingai.com/assets/avatar/Persona 4 Tennis.webp',
  destination_url = 'https://smartswingai.com/pricing.html?utm_source=meta&utm_medium=cpc&utm_campaign=trial_conversion&utm_content=C_social',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"trial_conversion","utm_content":"C_social"}'::jsonb
WHERE platform='meta' AND variant_group='C_social'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Trial Conversion Push (Meta Retargeting)');

UPDATE campaign_ad_creatives SET
  asset_url = 'https://smartswingai.com/assets/redesign/social.webp',
  thumbnail_url = 'https://smartswingai.com/assets/redesign/social.webp',
  destination_url = 'https://smartswingai.com/pricing.html?utm_source=meta&utm_medium=cpc&utm_campaign=trial_conversion&utm_content=D_urgency',
  utm_params = '{"utm_source":"meta","utm_medium":"cpc","utm_campaign":"trial_conversion","utm_content":"D_urgency"}'::jsonb
WHERE platform='meta' AND variant_group='D_urgency'
  AND campaign_id = (SELECT id FROM marketing_campaigns WHERE name='Trial Conversion Push (Meta Retargeting)');

INSERT INTO campaign_ad_creatives (campaign_id, creative_type, platform, placement, headline, primary_text, description, cta, status, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
SELECT mc.id, v.creative_type, v.platform, v.placement, v.headline, v.primary_text, v.description, v.cta, 'draft', v.variant_group, v.asset_url, v.thumbnail_url, v.destination_url, v.utm_params::jsonb
FROM marketing_campaigns mc, (VALUES
  ('image','google','display_banner','Your second swing report is the one','Run another analysis — see what changed. 20% off Player upgrade for the next 48h.','Display banner — trial users','See my progress',
    'G_display_personal',
    'https://smartswingai.com/assets/redesign/ai-improvement.webp',
    'https://smartswingai.com/assets/redesign/ai-improvement.webp',
    'https://smartswingai.com/pricing.html?utm_source=google&utm_medium=display&utm_campaign=trial_conversion&utm_content=G_display_personal',
    '{"utm_source":"google","utm_medium":"display","utm_campaign":"trial_conversion","utm_content":"G_display_personal"}'),
  ('image','google','display_banner','82% upgrade after report 2','Players like you upgrade after their second swing report. Free to run, 20% off if you upgrade in 48h.','Display banner — social proof','Upgrade now',
    'G_display_social',
    'https://smartswingai.com/assets/avatar/Persona 4 Tennis.webp',
    'https://smartswingai.com/assets/avatar/Persona 4 Tennis.webp',
    'https://smartswingai.com/pricing.html?utm_source=google&utm_medium=display&utm_campaign=trial_conversion&utm_content=G_display_social',
    '{"utm_source":"google","utm_medium":"display","utm_campaign":"trial_conversion","utm_content":"G_display_social"}')
) AS v(creative_type, platform, placement, headline, primary_text, description, cta, variant_group, asset_url, thumbnail_url, destination_url, utm_params)
WHERE mc.name = 'Trial Conversion Push (Meta Retargeting)'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Mark a "creatives ready" production step on every paid-media campaign
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT mc.id, 100, 'Cross-platform creative kit (assets wired)', 'creative_brief',
  'Assets from /assets/ wired into all existing creatives + new variants for additional platforms per ad-campaign-best-practices skill (Google high-intent, IG/YT cross-posts, LinkedIn B2B, Meta retargeting). All creatives status=draft for human review before launch.',
  '[{"kind":"creatives_ready","spec":"all variants populated with asset_url + destination_url + UTMs","status":"completed"}]'::jsonb,
  'completed', CURRENT_DATE
FROM marketing_campaigns mc
WHERE mc.is_paid_media = TRUE
ON CONFLICT (campaign_id, step_num) DO NOTHING;
