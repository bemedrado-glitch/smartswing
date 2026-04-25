-- ============================================================================
-- 20260425_coach_faqs.sql
-- AI Coach Chat: FAQ knowledge base + chat-history audit log
-- ============================================================================
-- Powers /api/ai-coach-chat. The endpoint does cheap keyword matching against
-- coach_faqs first (zero token cost), then falls back to OpenAI for unmatched
-- questions. coach_chat_logs gives us a paper trail for QA + cost monitoring.
-- ============================================================================

-- ── FAQs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_faqs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience        text NOT NULL CHECK (audience IN ('coach','player','both')),
  category        text NOT NULL,
  question        text NOT NULL,
  answer          text NOT NULL,
  -- Lowercase keyword tokens used for cheap LIKE/ILIKE matching before
  -- falling back to the LLM. Keep these short and specific.
  keywords        text[] NOT NULL DEFAULT '{}',
  priority        int  NOT NULL DEFAULT 100,  -- lower wins ties
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_faqs_audience_active_idx
  ON public.coach_faqs (audience, active);

CREATE INDEX IF NOT EXISTS coach_faqs_keywords_gin_idx
  ON public.coach_faqs USING gin (keywords);

-- Read-only for everyone (anon + authenticated). Writes via service role only.
ALTER TABLE public.coach_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_coach_faqs" ON public.coach_faqs;
CREATE POLICY "anon_read_coach_faqs"
  ON public.coach_faqs FOR SELECT
  USING (active = true);

-- ── Chat audit log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_chat_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience        text NOT NULL CHECK (audience IN ('coach','player')),
  question        text NOT NULL,
  answer          text NOT NULL,
  -- 'faq' = served from coach_faqs (free), 'llm' = OpenAI fallback (costs $)
  source          text NOT NULL CHECK (source IN ('faq','llm','error')),
  matched_faq_id  uuid REFERENCES public.coach_faqs(id) ON DELETE SET NULL,
  tokens_used     int,
  cost_usd        numeric(10,6),
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_chat_logs_user_idx
  ON public.coach_chat_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_chat_logs_source_idx
  ON public.coach_chat_logs (source, created_at DESC);

ALTER TABLE public.coach_chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_chat_logs" ON public.coach_chat_logs;
CREATE POLICY "users_read_own_chat_logs"
  ON public.coach_chat_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts (the API endpoint runs server-side with service key).

-- ── Seed FAQs ────────────────────────────────────────────────────────────────
INSERT INTO public.coach_faqs (audience, category, question, answer, keywords, priority) VALUES
-- ── COACH FAQs ────────────────────────────────────────────────
('coach','tactics','How do I help a player with inconsistent groundstrokes?',
 'Reduce target size in drills — a smaller cross-court box (e.g. service-box width) builds racquet-face control faster than full-court rallying. Pair with a 10-ball streak goal, then expand the target as consistency hits 80%+.',
 ARRAY['consistency','consistent','groundstroke','rally','unforced'], 50),

('coach','tactics','What''s a good drill for footwork?',
 'Split-step timing: feed 20 balls and have the player land their split-step JUST before the bounce. Then progress to 4-corner shadow drills (no ball, 30 sec, max effort). Footwork issues are 80% timing, 20% speed.',
 ARRAY['footwork','feet','movement','split-step','split step'], 50),

('coach','tactics','How do I motivate a junior who''s losing matches?',
 'Switch the win condition from result to process: 3 SMART micro-goals per match (e.g. "8 of 10 first serves in", "no UFE on game point"). Track only those, ignore the score. Confidence rebuilds in 3-4 matches.',
 ARRAY['junior','motivation','confidence','losing','frustrated','kids'], 50),

('coach','technique','My player''s forehand has a late contact point — what fix?',
 'Late contact is usually a unit-turn problem, not an arm problem. Cue: "shoulder behind the ball at bounce." Drill: shadow swings with non-hitting hand on the racquet throat — forces full coil. 3 sets of 10 before live ball.',
 ARRAY['forehand','contact','late','timing','unit turn','shoulder'], 60),

('coach','technique','What about a weak second serve?',
 'Almost always a toss + spin issue. Drill: kick-serve toss to 1 o''clock (right-hander), brush the ball 7-to-1, target the deuce-side body. 50 reps per session for 2 weeks. Track first-serve % AND second-serve attack rate.',
 ARRAY['serve','second serve','kick','toss','spin','double fault'], 60),

('coach','injury','Player has shoulder pain — what should I do?',
 'Stop overhead work immediately. Most amateur shoulder pain is rotator-cuff impingement from poor hip-shoulder sequencing. Refer to a sports physio first; rehab usually involves scapular stability work (band Y-T-W) and reloading the hip drive on serve.',
 ARRAY['shoulder','pain','injury','rotator','impingement','hurt'], 30),

('coach','injury','How do I prevent tennis elbow in my players?',
 'Three levers: (1) grip size — too small overworks forearm; (2) string tension — drop 3-5 lbs to absorb shock; (3) technique — late contact + wristy follow-through is the biggest cause. Add daily 2-min wrist eccentric drops (Theraband).',
 ARRAY['elbow','tennis elbow','epicondylitis','forearm','grip'], 30),

('coach','session-planning','How long should a junior session be?',
 'Under 10: 45 min, ONE theme. 10–13: 60 min, max 2 themes. 14+: 75–90 min. Energy drops sharply after 60 min for younger juniors — better to do 3 short sessions/week than 2 long ones.',
 ARRAY['session','junior','length','duration','plan','planning','kids'], 50),

('coach','session-planning','What should a typical week look like for a 4.0 player?',
 '3x technical (60 min, drilling), 1x match play (90 min), 1x fitness (45 min footwork+core), 1 rest day. Keep ratio ~70% drilling / 30% live ball until consistency hits target, then flip to 60/40.',
 ARRAY['week','schedule','plan','program','4.0','intermediate'], 60),

('coach','smartswing','How do I read a SmartSwing report?',
 'Top of the report shows shot grade and the #1 fix. Below that, body angles measured vs ideal — focus on the biggest gap first. The drill suggested at the bottom is matched to that gap. Follow it for one week and re-test.',
 ARRAY['report','smartswing','reading','interpret','grade','feedback'], 40),

('coach','smartswing','What''s a good target SmartSwing score for a 4.0 player?',
 'Range: 65-78 across forehand/backhand/serve. Below 65 = focus on consistency drills. Above 78 = ready to add deception (slice, drop shot). Aim for ALL three shot types within 8 points of each other (balanced game).',
 ARRAY['score','target','smartswing','rating','4.0','3.5','5.0'], 40),

('coach','smartswing','How often should my players re-test?',
 'Every 2-3 weeks during active improvement, monthly during maintenance. More frequent than that and the noise outweighs the signal. After a major technique change, wait 10 sessions before re-testing.',
 ARRAY['retest','test','frequency','how often','interval'], 40),

-- ── PLAYER FAQs ────────────────────────────────────────────────
('player','technique','How do I hit a topspin forehand?',
 'Three things in order: (1) racquet face slightly closed at contact, (2) low-to-high swing path (start below the ball, finish above your shoulder), (3) brush UP the back of the ball, don''t hit through it. Practice 50 cooperative cross-court rallies focused on net clearance — 4-5 feet over the net is a green light.',
 ARRAY['topspin','forehand','spin','technique','swing'], 50),

('player','technique','My serve is inconsistent — help?',
 'Serve consistency starts with the toss. Pick ONE toss spot (1 o''clock, slightly in front, height of full reach) and hit 30 tosses without hitting the ball. Then 30 serves to ONE target. Don''t change targets until you''re hitting 8 of 10. Most amateur serve issues are 80% toss, 20% swing.',
 ARRAY['serve','inconsistent','toss','first serve','double fault'], 50),

('player','technique','How do I add power without losing control?',
 'Power comes from the ground up: legs → hips → torso → shoulder → arm. Work on hip rotation drills (medicine ball throws, 10 reps each side). Then keep the same swing speed but add 10% more hip drive — power goes up, control stays. Trying to swing harder with the arm always loses control.',
 ARRAY['power','control','harder','faster','speed','add power'], 60),

('player','tactics','How should I handle a pusher?',
 'Three strategies that work: (1) come to net behind any short ball — pushers hate volleys; (2) hit deep cross-court repeatedly to one side until they break down; (3) mix in heavy slice to disrupt rhythm. Don''t try to out-rally them — you''ll lose the patience battle.',
 ARRAY['pusher','retriever','consistent opponent','annoying','frustrating'], 50),

('player','tactics','How do I beat a hard hitter?',
 'Take time away from them. Stand 2-3 feet inside the baseline on returns, take the ball early, hit with depth (not pace). Junk balls (slice, moonball) work great — they need rhythm. Vary spin and pace every 2-3 shots.',
 ARRAY['hard hitter','big hitter','power player','heavy ball'], 50),

('player','mental','I get nervous in match points — what do I do?',
 'Routine. Pick a pre-point routine (bounce ball 3 times, breathe, visualize target) and do it EXACTLY the same on every point — pressure or not. The brain calms when the body knows what to do. Practice it on practice points so it''s automatic in matches.',
 ARRAY['nervous','pressure','match point','choke','anxiety','tight'], 40),

('player','mental','How do I stop getting frustrated after mistakes?',
 'One-word reset. After any mistake, take one slow breath and say one word — "next" or "go." Drop the racquet head briefly to physically signal the page-turn. Frustration costs 2-3 free points per match. The reset routine takes 5 seconds and saves them.',
 ARRAY['frustrated','angry','tilt','mental','mistake','error'], 40),

('player','injury','My elbow hurts after playing — what should I do?',
 'Stop playing for 5-7 days, ice 15 min after activity, and check three things before resuming: (1) is your grip the right size (your ring finger should just touch your palm)? (2) is your string tension above 55 lbs (too tight)? (3) are you hitting the ball late? See a sports physio if pain returns.',
 ARRAY['elbow','tennis elbow','pain','arm','wrist','hurts'], 30),

('player','smartswing','How do I improve my SmartSwing score?',
 'Focus on the SINGLE biggest gap in your last report — usually one body angle that''s 15+ degrees off ideal. Do the suggested drill for one week, then re-test. Trying to fix everything at once = no improvement. One fix per week = compounding gains.',
 ARRAY['score','improve','smartswing','better','grade'], 40),

('player','equipment','What racquet should I buy?',
 'I can''t recommend specific brands, but the rule is: head size matches your level (3.0-3.5: 100-105 sq in / 3.5-4.5: 95-100 sq in / 4.5+: 95-98 sq in), weight 295-315g for adults, balanced or slightly head-light. Demo 3 racquets for a week each before buying — fit matters more than brand.',
 ARRAY['racquet','racket','buy','recommend','equipment','gear'], 70),

-- ── BOTH ────────────────────────────────────────────────
('both','support','How do I contact SmartSwing support?',
 'Tap the Contact link in the footer or email support@smartswingai.com. We typically reply within one business day. For account/billing issues, include your email so we can look up your subscription faster.',
 ARRAY['support','contact','help','email','billing','account'], 20),

('both','support','How do I cancel my subscription?',
 'Go to Settings → Billing → Manage Subscription. That opens the Stripe billing portal where you can cancel, change plan, or update payment. Cancellation takes effect at the end of the current billing period.',
 ARRAY['cancel','subscription','unsubscribe','billing','refund','plan'], 20),

('both','privacy','Is my swing video stored?',
 'Videos are stored privately in your account for as long as your subscription is active. Only you (and any coach you explicitly share with) can see them. You can delete any video any time from Library. Full details in our Privacy Policy.',
 ARRAY['privacy','video','data','delete','stored','GDPR'], 20)
ON CONFLICT DO NOTHING;
