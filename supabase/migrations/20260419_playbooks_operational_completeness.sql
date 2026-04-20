-- Playbook completeness pass: each paid-media campaign now has 15-16 steps
-- covering audience, tracking, budget, A/B test, kill/scale rules, ops
-- concerns, and reporting cadence — not just "make creative + launch".
--
-- Driven by /adspirer-ads-agent:campaign-performance + ad-campaign-best-practices
-- skill. Applied to prod 2026-04-19 via Supabase MCP.

-- CAMPAIGN 1 — Q2 Coach Outreach (LinkedIn + Google + Meta retarget)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT mc.id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date
FROM marketing_campaigns mc, (VALUES
  (200, 'Audience spec — LinkedIn Matched Audiences', 'audience_build',
    'PRIMARY (LinkedIn): job titles "Tennis Coach" OR "Tennis Director" OR "Head Pro" OR "Director of Tennis"; certifications: USPTA, PTR, PTCA, RPT, ITF; geos US+CA+UK+AU; company size 1-200; seniority Owner/Director/Manager. Min 5,000. EXCLUDE marketing_contacts where stage IN (customer, churned). RETARGETING: LinkedIn site visitors past 30d who did NOT submit lead form.',
    '[{"kind":"matched_audience","spec":"Min 5,000","status":"todo"},{"kind":"retargeting_audience","spec":"30-day site visitor non-converters","status":"todo"}]',
    '2026-04-25'),
  (201, 'Audience spec — Google Search keywords', 'audience_build',
    'EXACT: [tennis biomechanics analysis], [usta certified ai tools], [tennis coach software ai], [biomechanics for tennis coaches]. PHRASE: "ai swing analysis", "tennis stroke analysis", "biomechanics app coaching". NEGATIVES: golf, baseball, free download, jobs, careers, salary, certification cost. Daily cap $30. Bid: Maximize conversions (target CPA $50 once 30+ conversions hit).',
    '[{"kind":"keyword_list","spec":"4 exact + 3 phrase","status":"todo"}]',
    '2026-04-26'),
  (202, 'Conversion tracking events', 'pixel_setup',
    'LinkedIn Insight Tag: Lead, ViewContent, Booking. Google Ads: import LinkedIn Lead + Phone click. Meta Pixel: ViewContent + Lead + CAPI server-side via /api/marketing/meta-conversions with event_id dedup. Validate with Tag Assistant + LinkedIn Campaign Manager preview.',
    '[{"kind":"linkedin_insight_tag","spec":"3 events","status":"todo"},{"kind":"meta_capi","spec":"server-side","status":"todo"}]',
    '2026-04-24'),
  (203, 'Bidding + budget spec per platform', 'launch',
    'LinkedIn $30/day × 3 concepts = $90/day (Manual CPC starting $4-7, benchmark $7-12 for tennis-coach audiences). Google $30/day Maximize conversions, no tCPA until 30+ conversions. Meta retargeting $20/day Lowest cost optimize for Lead. Total $140/day. Campaign budget $1,500 over 60d = $25/day pacing minimum.',
    '[{"kind":"budget_table","spec":"$140/day across 3 platforms","status":"todo"}]',
    '2026-04-28'),
  (204, 'A/B test plan — concept rotation', 'creative_brief',
    'Wave 1 (d1-7): all 3 LinkedIn concepts (A_disrupt, B_data, C_hero) at $30/day each. Wave 2 (d8-21): kill any with CTR<0.6% AND CPL>$80; double winner. Wave 3 (d22-30): refresh creative on losers before retiring. Document each kill in CMO digest.',
    '[{"kind":"test_plan","spec":"3-wave concept rotation","status":"todo"}]',
    '2026-05-01'),
  (205, 'Optimization rules — kill + scale automation', 'launch',
    'KILL: ad with CTR<0.5% at impressions>=3000 AND no leads at spend>=$80. SCALE: ad with CPL<=$40 over rolling 3-day → +25% (cap +50% per 24h). FATIGUE: refresh when frequency>3.5 (LinkedIn) or 4.5 (Meta). RETARGETING: cap LinkedIn site retargeting at 5/week.',
    '[{"kind":"automated_rules","spec":"kill + scale + fatigue","status":"todo"}]',
    '2026-05-02'),
  (206, 'Reporting cadence + KPI thresholds', 'research',
    'DAILY (first 7d): CTR, CPL, leads/day, spend pacing → #marketing-ops 9am ET. WEEKLY (after d7): top/bottom creative by CPL, audience saturation, frequency, MQL→SQL conversion, pipeline contribution. Targets: blended CPL <=$55, MQL→trial signup >=8%, trial→paid >=12%. Pause if blended CPL >$90 for 3 consecutive days.',
    '[{"kind":"reporting_template","spec":"daily + weekly","status":"todo"}]',
    '2026-05-05')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
WHERE mc.name = 'Q2 Coach Outreach (LinkedIn Lead Gen)'
ON CONFLICT (campaign_id, step_num) DO NOTHING;

-- CAMPAIGN 2 — TikTok Biomechanics Series
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT mc.id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date
FROM marketing_campaigns mc, (VALUES
  (200, 'Audience spec — TikTok + IG + YT Shorts', 'audience_build',
    'TikTok: interests Tennis + Sports & Athletics + Tennis Equipment; behaviors Sports Content Engagers (30d); ages 18-44; geos US+CA. EXCLUDE under 18. Custom audience: viewers ≥50% of episodes 1-4. IG via Meta Audience Network same interest stack. YT Shorts: Topic targeting Tennis + Sports Coaching; exclude Kids content placement.',
    '[{"kind":"tt_interest_audience","spec":"Tennis interests, 18-44","status":"todo"},{"kind":"video_view_retarget","spec":"50%+ ep 1-4","status":"todo"}]',
    '2026-04-25'),
  (201, 'Conversion tracking events', 'pixel_setup',
    'TikTok Pixel: ViewContent, Subscribe, CompletePayment. IG via Meta Pixel: same 3 + ViewContent_Reel custom event. YT via GTM Server tag → Google Ads import. Free first-report = Subscribe event. Validate with TikTok Pixel Helper, Meta Pixel Helper, GA4 DebugView.',
    '[{"kind":"tt_pixel","spec":"3 events","status":"todo"}]',
    '2026-04-24'),
  (202, 'Bidding + budget spec per platform', 'launch',
    'ORGANIC FIRST (no spend): post episodes 1-4 weeks 1-2, monitor watch-time + share rate. SPARK BOOST after week 2: top 2 organic posts → $50/day × 14d TikTok Spark Ad. IG Reels boost: $20/day × 14d top cross-post. YT Shorts organic only. Target CPA: free signup <=$5, trial start <=$15.',
    '[{"kind":"organic_phase","spec":"weeks 1-2 measurement only","status":"todo"}]',
    '2026-05-06'),
  (203, 'A/B test plan — hook iteration', 'creative_brief',
    'Test opening 2s. A: stat-shock ("Most 3.5 players: 12°"). B: question-hook ("Why is your forehand stuck?"). C: identity-hook ("If you''re a 3.5+ player, watch this"). 7 days each at $25/day, compare 3-second hold rate (NOT view count). Winner gets next 3 episodes scripted with that style.',
    '[{"kind":"hook_test","spec":"3 variants × 7 days","status":"todo"}]',
    '2026-05-08'),
  (204, 'Optimization rules — kill + scale', 'launch',
    'KILL: boosted post with 3-second-hold-rate <35% at 5K impressions OR CPM >$25. SCALE: organic post above 2x baseline watch-time → boost as Spark Ad. FATIGUE: refresh hook+visual every 5-7 days (TikTok creative dies fast).',
    '[{"kind":"automated_rules","spec":"kill on hold-rate + CPM","status":"todo"}]',
    '2026-05-12'),
  (205, 'Creative refresh cadence — episode pipeline', 'content_piece',
    '2 new episodes filmed every 2 weeks. Template: hook (0-2s) + problem (2-15s) + AI proof shot (15-30s) + drill (30-45s) + CTA (45-60s). Re-shoot each in 2 demographic variants (Persona 1 young male, Persona 2 adult female; reuse /assets/avatar/Persona [1-4]). Target: 8 episodes by campaign end.',
    '[{"kind":"production_calendar","spec":"2 eps/2 weeks × 2 variants","status":"todo"}]',
    '2026-05-15'),
  (206, 'Reporting cadence + KPI thresholds', 'research',
    'DAILY (first 14d): organic watch-time, share rate, comment sentiment, link-CTR. WEEKLY: cost per signup (paid), follower growth, top hooks ranked, audience saturation by interest cluster. Targets: 3-second-hold >=45%, full-watch >=18%, link-CTR >=2%, signup CPA <=$8 blended. Pause Spark Ads if signup CPA >$20 for 5 days.',
    '[{"kind":"reporting_template","spec":"daily + weekly TikTok-specific","status":"todo"}]',
    '2026-05-20')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
WHERE mc.name = 'TikTok Biomechanics Series (Spark Ads)'
ON CONFLICT (campaign_id, step_num) DO NOTHING;

-- CAMPAIGN 3 — Club Pilot Program (Meta + LinkedIn + Google)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT mc.id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date
FROM marketing_campaigns mc, (VALUES
  (200, 'Audience spec — multi-platform B2B', 'audience_build',
    'META: interests USTA + Tennis Club Management + Tennis Facility + Country Club Management; titles GM + Tennis Director + Head Pro; geos top 50 US MSAs; LAL 1% from existing club customers. LINKEDIN: industry Sports / Recreational Facilities; titles Director of Tennis + GM Tennis + Tennis Operations Manager; size 50-1000. GOOGLE: keywords [tennis club management software], [tennis program management ai], [court usage analytics] exact+phrase. Min: Meta 50K, LinkedIn 5K, Google >10 searches/keyword/day.',
    '[{"kind":"meta_core_audience","spec":"USA metros 50K+","status":"todo"},{"kind":"linkedin_company_titles","spec":"4 titles","status":"todo"},{"kind":"google_keywords","spec":"3 exact + 5 phrase","status":"todo"}]',
    '2026-04-26'),
  (201, 'Conversion tracking events', 'pixel_setup',
    'Meta Pixel + CAPI via /api/marketing/meta-conversions: ViewContent, Lead, CompleteRegistration. LinkedIn Insight: same 3. Google Ads: import Lead from both. Dedupe Meta CAPI with browser pixel using event_id (sha256 contact_id+timestamp). Server-side mirror catches iOS 14.5+ tracking-blocked sessions.',
    '[{"kind":"meta_pixel_capi","spec":"3 events with dedup","status":"todo"}]',
    '2026-04-27'),
  (202, 'Bidding + budget spec per platform', 'launch',
    'META CBO $30/day across 3 ad sets (Core, LAL 1%, LAL 3%) optimizing for Lead. LINKEDIN $50/day Manual CPC starting $8-10 optimize for Lead form fill. GOOGLE Search $40/day Maximize conversions, then tCPA $80 after 30+ conversions. Total $120/day × 60d = $7,200 vs $2,500 budget — RECOMMEND cut to $85/day × 60d = $5,100 (still over; either approve $5,100 or shorten to 30 days).',
    '[{"kind":"budget_recommendation","spec":"$85/day — needs CFO sign-off","status":"todo"}]',
    '2026-05-05'),
  (203, 'A/B test plan — testimonial vs. data', 'creative_brief',
    'Test emotional hook style. A: testimonial-first (Westchester director on camera). B: ROI-first (data carousel — coach capacity math). C: before/after (1-coach-per-6 → 1-per-14 stat hero). All 3 simultaneously × 14 days at equal $10/day. Statistically significant winner gets 80% of remaining budget.',
    '[{"kind":"creative_test","spec":"3 hooks × 14 days","status":"todo"}]',
    '2026-05-09'),
  (204, 'Optimization rules — kill + scale + retarget waterfall', 'launch',
    'KILL: ad set with LP-CTR <0.6% at spend >=$100. SCALE: ad set with CPL <=$80 over rolling 5-day → +20% (cap +40% per 24h). RETARGETING WATERFALL: d1-3 visitor non-converted → ROI calc video. d4-7 → "5-min pilot Q&A" book-a-call. d8-14 → testimonial reel. Drop after 14 days (frequency cap).',
    '[{"kind":"automated_rules","spec":"kill + scale + 14-day waterfall","status":"todo"}]',
    '2026-05-12'),
  (205, 'Sales hand-off SLA', 'launch',
    'Lead → Sales SLA: <1h business hours (M-F 9am-7pm ET), <24h otherwise. Form submit → Slack #sales + auto-create marketing_contacts row stage=prospect tag=club_pilot_q2 assigned_to=round-robin. Discovery call booked within 48h. Marketing owns lead until sales accepts (Slack reaction = accepted).',
    '[{"kind":"slack_alert","spec":"#sales webhook","status":"todo"},{"kind":"sla","spec":"<1h business <24h off","status":"todo"}]',
    '2026-05-04'),
  (206, 'Reporting cadence + KPI thresholds', 'research',
    'DAILY (first 21d): leads/day, CPL by platform, ad set delivery health, sales acceptance rate. WEEKLY: pipeline contribution ($), top creatives by CPL, retargeting saturation. Targets: blended CPL <=$120, lead → discovery call >=30%, discovery → pilot signup >=25%. Pause if blended CPL >$200 for 5 days.',
    '[{"kind":"reporting_template","spec":"daily + weekly + pipeline tie-back","status":"todo"}]',
    '2026-05-20')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
WHERE mc.name = 'Club Pilot Program Launch (Meta Conversion)'
ON CONFLICT (campaign_id, step_num) DO NOTHING;

-- CAMPAIGN 4 — Trial Conversion Push (Meta + Google Display)
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT mc.id, s.step_num, s.step_name, s.step_type, s.content_brief, s.deliverables::jsonb, 'planned', s.due_date::date
FROM marketing_campaigns mc, (VALUES
  (200, 'Audience spec — trial-user retargeting', 'audience_build',
    'META Custom Audience (refreshed daily via Meta API): subscription_tier=starter AND created_at > NOW()-90d AND no paid upgrade. EXCLUDE subscription_tier IN (pro, elite, coach), recently-paid (last 7d), opted_out. Daily refresh script: /api/marketing/refresh-meta-audience (TODO build). GOOGLE Display: same audience via Customer Match (hashed emails uploaded daily). ~150 audience size — small, expect high frequency.',
    '[{"kind":"meta_custom_audience","spec":"daily refresh","status":"todo"},{"kind":"refresh_endpoint","spec":"/api/marketing/refresh-meta-audience","status":"todo"}]',
    '2026-04-18'),
  (201, 'Conversion tracking events', 'pixel_setup',
    'Custom event UpgradeTrial fires on payment-success.html when previous-tier=starter AND new-tier IN (pro, elite). Attribution via fbclid (Meta) and gclid (Google) stored in session storage. CAPI mirror so iOS-blocked sessions still attribute. Conversion window: 7-day click + 1-day view. Validate with Stripe webhook + UTM source check.',
    '[{"kind":"custom_event","spec":"UpgradeTrial with tier-change check","status":"todo"}]',
    '2026-04-19'),
  (202, 'Bidding + budget spec per platform', 'launch',
    'META $30/day CBO retargeting optimize for UpgradeTrial. GOOGLE Display $15/day Maximize conversions targeting Customer Match. Total $45/day × 30d = $1,350 vs $900 budget — REDUCE: Meta to $20/day + Google to $10/day = $30/day × 30d = $900 ✓. Bid aggressively first 48h: allow CPA up to $80 to accelerate optimization.',
    '[{"kind":"budget_table","spec":"$30/day blended","status":"todo"}]',
    '2026-04-22'),
  (203, 'A/B test plan — urgency vs. social proof', 'creative_brief',
    'Test motivation lever. A: personal-progress ("See what changed"). B: social-proof ("82% upgrade after report 2"). C: urgency ("48 hours, 20% off"). Equal $7/day each first week. Winner: highest UpgradeTrial CVR (NOT click rate — clicks are easy on retargeting).',
    '[{"kind":"creative_test","spec":"3 levers × 7 days","status":"todo"}]',
    '2026-04-29'),
  (204, 'Optimization rules — small-audience handling', 'launch',
    'KILL: ad with frequency >6 over 7 days (small audience burns out fast). SCALE: ad with UpgradeTrial CPA <=$40 → +20% (cap $40/day total — this is retargeting, not acquisition). FATIGUE: refresh creative every 5 days regardless of performance. NEW USER ENTRY: any new trial user auto-enters retargeting pool 24h after first analysis.',
    '[{"kind":"automated_rules","spec":"frequency cap + 5-day refresh","status":"todo"}]',
    '2026-04-25'),
  (205, 'Discount code + landing page coordination', 'launch',
    'Stripe coupon TRIAL20OFF: 20% off first 3 months Player plan, expires when subscription_tier becomes paid OR 7d (whichever first). LP /pricing.html?ref=trial_conversion auto-applies coupon via URL param. Track redemption rate as separate KPI (target >=60% of UpgradeTrial conversions use coupon — if lower, urgency creative isn''t reaching clickers).',
    '[{"kind":"stripe_coupon","spec":"TRIAL20OFF 7d expiry, 3 months","status":"todo"}]',
    '2026-04-23'),
  (206, 'Reporting cadence + KPI thresholds', 'research',
    'DAILY (first 14d): UpgradeTrial conversions, CPA per platform, frequency, audience size (small audience requires monitoring shrinkage). WEEKLY: cohort lift (trial users retargeted vs. control), coupon redemption, multi-touch attribution check. Targets: blended UpgradeTrial CPA <=$35, retargeting cohort lift >=25%. Pause if cohort lift <10% (campaign no longer additive).',
    '[{"kind":"reporting_template","spec":"daily UpgradeTrial + weekly cohort lift","status":"todo"}]',
    '2026-04-30')
) AS s(step_num, step_name, step_type, content_brief, deliverables, due_date)
WHERE mc.name = 'Trial Conversion Push (Meta Retargeting)'
ON CONFLICT (campaign_id, step_num) DO NOTHING;

-- Top-level milestone marker
INSERT INTO campaign_steps (campaign_id, step_num, step_name, step_type, content_brief, deliverables, status, due_date)
SELECT mc.id, 999, 'Playbook complete — ready for launch review', 'launch',
  'All operational steps populated: audiences specified, conversion tracking mapped, bidding + budget per platform, A/B test plan, kill/scale rules, reporting cadence with KPI thresholds + pause triggers. Campaign ready for human launch review. Status remains draft until explicit promotion.',
  '[{"kind":"playbook_milestone","spec":"all 200-series steps populated","status":"completed"}]'::jsonb,
  'completed', CURRENT_DATE
FROM marketing_campaigns mc
WHERE mc.is_paid_media = TRUE
ON CONFLICT (campaign_id, step_num) DO NOTHING;
