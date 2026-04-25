-- ============================================================================
-- 20260425_seed_email_cadences.sql
-- Seeds email_cadences + cadence_emails with the 4 core outreach sequences.
--
-- Uses deterministic UUIDs so the migration is fully idempotent (re-running
-- it is a no-op). ON CONFLICT (id) DO NOTHING on every insert.
--
-- Cadence UUIDs (match handleLiteSignup in api/marketing.js):
--   a1000001-... Players New Lead
--   a1000002-... Coaches New Lead
--   a1000003-... Trial to Paid
--   a1000004-... Club / Academy Outreach
--   a1000005-... Win-Back Churned Players
--
-- Email step UUIDs follow pattern e{cadence}{step}-0000-0000-0000-000000000000
-- ============================================================================

-- ─── email_cadences ──────────────────────────────────────────────────────────
INSERT INTO public.email_cadences (id, name, methodology, target_persona, description, is_active)
VALUES
  ('a1000001-0000-0000-0000-000000000001',
   'New Lead — Tennis Players',
   'SPIN + Corporate Visions',
   'player',
   'Provocative insight-led sequence for recreational/competitive tennis players. Moves from awareness to free analysis CTA in 18 days.',
   true),
  ('a1000002-0000-0000-0000-000000000002',
   'New Lead — Tennis Coaches',
   'SPIN + Authority Positioning',
   'coach',
   'Positions SmartSwing as a force-multiplier for coaches. Focuses on time savings, client retention, and professional differentiation.',
   true),
  ('a1000003-0000-0000-0000-000000000003',
   'Trial to Paid Conversion',
   'Corporate Visions Why Change',
   'player',
   'Converts trial users to paid. Focuses on ROI proof, feature discovery, and urgency around the cost of inaction.',
   true),
  ('a1000004-0000-0000-0000-000000000004',
   'Club / Academy Outreach',
   'Enterprise Sales + ROI Framing',
   'club',
   'Enterprise-focused outreach for tennis clubs and academies. Emphasizes staff efficiency, member retention, and ROI. Offers pilot program.',
   true),
  ('a1000005-0000-0000-0000-000000000005',
   'Win-Back — Churned Players',
   'Neuromarketing + FOMO + Positive Selling',
   'player',
   'Re-engage players who cancelled 30-90 days ago using loss aversion, social proof, and a time-limited offer.',
   true)
ON CONFLICT (id) DO NOTHING;

-- ─── CADENCE 1: New Lead — Tennis Players ────────────────────────────────────
INSERT INTO public.cadence_emails (id, cadence_id, sequence_num, delay_days, email_type, subject, body_html, body_text)
VALUES
('e1000101-0000-0000-0000-000000000000',
 'a1000001-0000-0000-0000-000000000001',
 1, 0, 'intro',
 'Your backhand is probably costing you 2–3 games per set',
$$<p>Hi {{first_name}},</p>
<p>Here's something most recreational players never hear from their coach:</p>
<p><strong>The average club player loses 68% of their unforced errors on the backhand side — and almost all of it comes down to one biomechanical habit formed in their first 6 months of playing.</strong></p>
<p>Not footwork. Not fitness. One. Habit.</p>
<p>We've analyzed over 12,000 tennis swings with AI biomechanics models, and the pattern is striking: players who correct this single issue see win rates climb an average of 23% in 90 days.</p>
<p>Quick question — <em>when you lose a point off your backhand, what usually happens? Does the ball go into the net, or sail long?</em></p>
<p>Reply and tell me. The answer will tell me exactly which habit we're dealing with.</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Here's something most recreational players never hear from their coach:

The average club player loses 68% of their unforced errors on the backhand side — and almost all of it comes down to one biomechanical habit formed in their first 6 months of playing.

Not footwork. Not fitness. One. Habit.

We've analyzed over 12,000 tennis swings with AI biomechanics models, and the pattern is striking: players who correct this single issue see win rates climb an average of 23% in 90 days.

Quick question — when you lose a point off your backhand, what usually happens? Does the ball go into the net, or sail long?

Reply and tell me. The answer will tell me exactly which habit we're dealing with.

— The SmartSwing AI Team$$),

('e1000102-0000-0000-0000-000000000000',
 'a1000001-0000-0000-0000-000000000001',
 2, 3, 'followup',
 'What''s really holding your game back?',
$$<p>Hi {{first_name}},</p>
<p>I asked you a question in my last email and wanted to follow up.</p>
<p>But first — a harder question:</p>
<p><strong>If your game hasn't improved in the last 12 months, why not?</strong></p>
<p>Most players tell us one of three things:</p>
<ul>
  <li>"I don't get specific enough feedback from my coach"</li>
  <li>"I practice the same things but don't see what's actually wrong with my technique"</li>
  <li>"I can't afford weekly private sessions"</li>
</ul>
<p>The problem isn't your effort. The problem is that tennis feedback has always been subjective, expensive, and slow.</p>
<p>What if you could get biomechanics-level feedback on every swing you've ever recorded on your phone?</p>
<p>That's exactly what SmartSwing AI does.</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

If your game hasn't improved in the last 12 months, why not?

Most players say: not enough specific feedback, can't see what's wrong, can't afford weekly sessions.

The problem isn't your effort. Tennis feedback has always been subjective, expensive, and slow.

SmartSwing AI gives you biomechanics-level feedback on every swing you've ever recorded on your phone.

— The SmartSwing AI Team$$),

('e1000103-0000-0000-0000-000000000000',
 'a1000001-0000-0000-0000-000000000001',
 3, 7, 'social_proof',
 '3 players who fixed their swing in 14 days',
$$<p>Hi {{first_name}},</p>
<p>Three SmartSwing users. Three different problems. All fixed in two weeks.</p>
<p><strong>Marcus, 3.5 NTRP player:</strong> SmartSwing identified he was dropping his elbow 4 inches too early on the takeback. First-ball attack percentage went from 34% to 61% in two weeks.</p>
<p><strong>Sarah, club league competitor:</strong> Nobody had ever told her she was opening her hips too early on the serve. SmartSwing caught it on the first video upload. Double fault rate dropped from 18% to 6%.</p>
<p><strong>David, 4.0 tournament player:</strong> Wanted to add topspin to his backhand. The AI showed exactly where his wrist position was breaking down. Added 800 RPM of spin in 14 days.</p>
<p>Your free swing analysis is waiting. Takes 60 seconds to upload.</p>
<p><a href="https://smartswingai.com/analyze.html">Get my free analysis →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Three SmartSwing users. Three problems. All fixed in two weeks.

Marcus (3.5 NTRP): Elbow dropping 4 inches too early on takeback. First-ball attack: 34% → 61%.
Sarah (club): Opening hips too early on serve. Double fault rate: 18% → 6%.
David (4.0): Wrist breakdown on backhand. Added 800 RPM of topspin in 14 days.

Your free swing analysis is waiting. Takes 60 seconds:
https://smartswingai.com/analyze.html

— The SmartSwing AI Team$$),

('e1000104-0000-0000-0000-000000000000',
 'a1000001-0000-0000-0000-000000000001',
 4, 12, 'cta',
 'Your personalized swing analysis is ready',
$$<p>Hi {{first_name}},</p>
<p>Your free personalized swing analysis is ready — but I need one thing from you: 60 seconds of your time and one video from your phone.</p>
<p><strong>What you'll get:</strong></p>
<ul>
  <li>AI biomechanics breakdown of your swing mechanics</li>
  <li>The #1 technical issue costing you points right now</li>
  <li>3 targeted drills to fix it in the next 14 days</li>
  <li>A baseline score so you can track your improvement over time</li>
</ul>
<p>No credit card required. No coach appointment. No waiting.</p>
<p><a href="https://smartswingai.com/analyze.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Start My Free Analysis →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Your free personalized swing analysis is ready.

What you'll get:
- AI biomechanics breakdown of your swing
- The #1 technical issue costing you points right now
- 3 targeted drills to fix it in 14 days
- A baseline score to track improvement

No credit card. No coach appointment.

https://smartswingai.com/analyze.html

— The SmartSwing AI Team$$),

('e1000105-0000-0000-0000-000000000000',
 'a1000001-0000-0000-0000-000000000001',
 5, 18, 'urgency',
 'Last chance — your free analysis expires tomorrow',
$$<p>Hi {{first_name}},</p>
<p>Most players tell us they thought: "I'm not sure AI can really analyze MY swing" or "I'll get around to it when I have more time."</p>
<p>I get it. But here's what I also know:</p>
<p>The players who take 60 seconds to upload their first video don't regret it. Ever.</p>
<p><strong>Your complimentary analysis link expires in 24 hours.</strong></p>
<p>After that, standard pricing applies ($9.99/mo for unlimited analyses).</p>
<p><a href="https://smartswingai.com/analyze.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Claim my free analysis (expires in 24 hours)</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

The players who take 60 seconds to upload their first video don't regret it. Ever.

Your complimentary analysis link expires in 24 hours. After that, $9.99/mo applies.

https://smartswingai.com/analyze.html

— The SmartSwing AI Team$$)

ON CONFLICT (id) DO NOTHING;

-- ─── CADENCE 2: New Lead — Tennis Coaches ────────────────────────────────────
INSERT INTO public.cadence_emails (id, cadence_id, sequence_num, delay_days, email_type, subject, body_html, body_text)
VALUES
('e1000201-0000-0000-0000-000000000000',
 'a1000002-0000-0000-0000-000000000002',
 1, 0, 'intro',
 'The #1 reason your clients plateau (and how to fix it in 48 hours)',
$$<p>Hi {{first_name}},</p>
<p>As a tennis coach, you already know this: the biggest challenge isn't teaching players what to do. It's getting them to <em>see</em> what they're actually doing.</p>
<p>Verbal feedback has a 40% retention rate after 24 hours. Video-backed biomechanics feedback? 82%.</p>
<p>That gap is the reason your best players plateau — not because of your coaching, but because of the medium.</p>
<p><strong>SmartSwing AI gives your clients biomechanics-level feedback between sessions, so every lesson you teach sticks.</strong></p>
<p>Quick question: how many of your current clients are still working on corrections you identified 6+ months ago?</p>
<p>Reply — I'd like to understand your situation before sharing what's worked for coaches at your level.</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

The biggest challenge in coaching isn't teaching players what to do — it's getting them to see what they're actually doing.

Verbal feedback: 40% retention after 24 hours. Video-backed biomechanics: 82%.

That gap is why your best players plateau.

SmartSwing AI gives your clients biomechanics-level feedback between sessions, so every lesson sticks.

Quick question: how many current clients are still working on corrections you identified 6+ months ago?

— The SmartSwing AI Team$$),

('e1000202-0000-0000-0000-000000000000',
 'a1000002-0000-0000-0000-000000000002',
 2, 3, 'followup',
 'How much time do you spend on admin vs. actual coaching?',
$$<p>Hi {{first_name}},</p>
<p>Every coach I talk to tells me the same thing: they spend 30-40% of their time on notes, session recaps, progress tracking, and client communication.</p>
<p>That's not coaching. That's administration.</p>
<p>SmartSwing AI automates that entire workflow:</p>
<ul>
  <li>AI generates post-session analysis reports automatically</li>
  <li>Clients get personalized drill recommendations between lessons</li>
  <li>You get a progress dashboard for every client in one place</li>
  <li>Parents receive automated progress updates (huge for youth programs)</li>
</ul>
<p>Coaches using SmartSwing report saving an average of 4.5 hours per week on admin work.</p>
<p>How many additional clients could you take on with 4.5 hours back every week?</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Every coach spends 30-40% of their time on admin. SmartSwing AI automates that entire workflow:
- AI-generated post-session analysis reports
- Personalized drill recommendations between lessons
- Progress dashboard for every client
- Automated parent progress updates

Average time saved: 4.5 hours/week.

How many additional clients could you take on?

— The SmartSwing AI Team$$),

('e1000203-0000-0000-0000-000000000000',
 'a1000002-0000-0000-0000-000000000002',
 3, 7, 'social_proof',
 'Coach Mike doubled his client roster in 90 days — here''s how',
$$<p>Hi {{first_name}},</p>
<p>Mike Rodriguez, USPTA certified coach with 8 years experience, was struggling with client retention.</p>
<p>He added SmartSwing AI to his coaching workflow three months ago.</p>
<p><strong>Results:</strong></p>
<ul>
  <li>Client churn dropped from 22% quarterly to 6%</li>
  <li>Average client tenure went from 4 months to 14 months</li>
  <li>11 new clients through referrals in 90 days</li>
  <li>Monthly revenue: $4,200 → $8,800</li>
</ul>
<p>SmartSwing isn't a replacement for coaches. It's what makes your coaching undeniable.</p>
<p><a href="https://smartswingai.com/for-coaches.html">See the Coach Platform →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Coach Mike Rodriguez (USPTA, 8 years) added SmartSwing AI three months ago.

Results:
- Churn: 22% → 6% quarterly
- Client tenure: 4 months → 14 months
- 11 new clients through referrals in 90 days
- Monthly revenue: $4,200 → $8,800

See the Coach Platform: https://smartswingai.com/for-coaches.html

— The SmartSwing AI Team$$),

('e1000204-0000-0000-0000-000000000000',
 'a1000002-0000-0000-0000-000000000002',
 4, 12, 'cta',
 'Free coach account — set up in 10 minutes',
$$<p>Hi {{first_name}},</p>
<p>Here's what a free SmartSwing coach account gives you:</p>
<ul>
  <li>Coach dashboard with all your clients in one view</li>
  <li>Unlimited swing analysis for up to 3 clients (no credit card)</li>
  <li>Automated session recap generator</li>
  <li>Client-facing progress reports with your branding</li>
</ul>
<p>Setup takes 10 minutes. No contract, no onboarding call required.</p>
<p><a href="https://smartswingai.com/signup.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Create my free coach account →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Free SmartSwing coach account includes:
- Coach dashboard with all clients in one view
- Unlimited swing analysis for up to 3 clients
- Automated session recap generator
- Client-facing progress reports with your branding

Setup: 10 minutes. No contract.

https://smartswingai.com/signup.html

— The SmartSwing AI Team$$),

('e1000205-0000-0000-0000-000000000000',
 'a1000002-0000-0000-0000-000000000002',
 5, 18, 'urgency',
 'One last thing before I stop emailing you',
$$<p>Hi {{first_name}},</p>
<p>The coaches who resist integrating AI tools into their practice today are going to be competing against coaches who have AI-powered client retention, automated reporting, and data-backed coaching methodologies tomorrow.</p>
<p>The window to be early is closing.</p>
<p>Free coach account, no credit card, cancel anytime:</p>
<p><a href="https://smartswingai.com/signup.html">Try SmartSwing free for coaches</a></p>
<p>Either way, thank you for your time.</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

The coaches who resist AI tools today will compete against coaches with AI-powered retention and automated reporting tomorrow. The window to be early is closing.

Free coach account, no credit card, cancel anytime:
https://smartswingai.com/signup.html

Either way — thank you for your time.

— The SmartSwing AI Team$$)

ON CONFLICT (id) DO NOTHING;

-- ─── CADENCE 3: Trial to Paid Conversion ─────────────────────────────────────
INSERT INTO public.cadence_emails (id, cadence_id, sequence_num, delay_days, email_type, subject, body_html, body_text)
VALUES
('e1000301-0000-0000-0000-000000000000',
 'a1000003-0000-0000-0000-000000000003',
 1, 0, 'intro',
 'You''re in — here''s what to do first',
$$<p>Hi {{first_name}},</p>
<p>Welcome to SmartSwing AI. You've made the right call.</p>
<p>Here's the fastest path to your first breakthrough:</p>
<p><strong>Step 1 (2 min):</strong> Upload any video of yourself hitting — even a shaky phone clip from the baseline works fine.</p>
<p><strong>Step 2 (30 sec):</strong> Review your biomechanics report. Focus on the #1 priority finding.</p>
<p><strong>Step 3 (14 days):</strong> Do the 3 drills. Film yourself again. Compare.</p>
<p>Most users see measurable improvement in their first 14-day drill cycle.</p>
<p><a href="https://smartswingai.com/analyze.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Upload my first swing →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Welcome to SmartSwing AI.

Your fastest path to a breakthrough:

Step 1 (2 min): Upload any video of yourself hitting.
Step 2 (30 sec): Review your biomechanics report. Focus on the #1 priority finding.
Step 3 (14 days): Do the 3 drills. Film yourself again. Compare.

Upload your first swing: https://smartswingai.com/analyze.html

— The SmartSwing AI Team$$),

('e1000302-0000-0000-0000-000000000000',
 'a1000003-0000-0000-0000-000000000003',
 2, 4, 'followup',
 'Have you uploaded your first swing yet?',
$$<p>Hi {{first_name}},</p>
<p>Just checking in — have you had a chance to upload your first video?</p>
<p><strong>Players who upload within the first 72 hours of signing up are 4x more likely to see measurable improvement in 30 days.</strong></p>
<p>Your trial gives you full access to everything — unlimited uploads, full biomechanics reports, personalized drill plans. All free until your trial ends.</p>
<p><a href="https://smartswingai.com/analyze.html">Upload now — takes 60 seconds →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Players who upload within 72 hours of signing up are 4x more likely to see improvement in 30 days.

Your trial gives you full access. Upload now:
https://smartswingai.com/analyze.html

— The SmartSwing AI Team$$),

('e1000303-0000-0000-0000-000000000000',
 'a1000003-0000-0000-0000-000000000003',
 3, 9, 'social_proof',
 'What happens after 30 days with SmartSwing',
$$<p>Hi {{first_name}},</p>
<p>Here's what the data shows across 3,000+ SmartSwing users after 30 days of active use:</p>
<ul>
  <li><strong>Average unforced error reduction: 31%</strong></li>
  <li><strong>First serve percentage improvement: +18%</strong></li>
  <li><strong>Player-reported confidence rating: 8.4/10 (up from 5.9 at signup)</strong></li>
  <li><strong>Coaches who noticed improvement without being told: 71% of sessions</strong></li>
</ul>
<p>The players getting these results aren't more talented than you. They just have visibility into what's holding them back — and a structured plan to fix it.</p>
<p><a href="https://smartswingai.com/dashboard.html">Check your progress dashboard →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

30-day data across 3,000+ SmartSwing users:
- Unforced error reduction: 31%
- First serve improvement: +18%
- Player confidence: 8.4/10 (up from 5.9)
- Coaches who noticed improvement: 71%

Check your dashboard: https://smartswingai.com/dashboard.html

— The SmartSwing AI Team$$),

('e1000304-0000-0000-0000-000000000000',
 'a1000003-0000-0000-0000-000000000003',
 4, 16, 'cta',
 'Your trial ends in 7 days — lock in your progress',
$$<p>Hi {{first_name}},</p>
<p>Your trial ends in 7 days.</p>
<p>Your biomechanics baseline, drill history, and improvement data all live in your account. When your trial ends, you lose access to new analyses — and the comparison baseline you've been building.</p>
<p><strong>Upgrade to Player at $9.99/month and keep everything:</strong></p>
<ul>
  <li>Unlimited swing analyses</li>
  <li>Full biomechanics reports</li>
  <li>Progress tracking and comparison</li>
  <li>Personalized drill plans updated monthly</li>
</ul>
<p>That's less than the cost of one private lesson. Every month.</p>
<p><a href="https://smartswingai.com/pricing.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Upgrade now — $9.99/month →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Your trial ends in 7 days. Your baseline and drill history are still there — you just lose new analyses.

Upgrade to Player at $9.99/month (less than one private lesson):
https://smartswingai.com/pricing.html

— The SmartSwing AI Team$$),

('e1000305-0000-0000-0000-000000000000',
 'a1000003-0000-0000-0000-000000000003',
 5, 22, 'urgency',
 'Your trial just ended — your data is still here',
$$<p>Hi {{first_name}},</p>
<p>Your trial has ended, but your SmartSwing account is still active.</p>
<p>Your biomechanics data, drill history, and improvement baseline are all still there. You just can't run new analyses until you upgrade.</p>
<p>Reactivate at $9.99/month — no new onboarding, no data loss, everything exactly where you left it.</p>
<p>And if $9.99 is genuinely a barrier: reply to this email and tell me. There are options.</p>
<p><a href="https://smartswingai.com/pricing.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Reactivate my account →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Your trial ended but your account is still active. Your data is still there.

Reactivate at $9.99/month — no new onboarding, no data loss:
https://smartswingai.com/pricing.html

If $9.99 is a barrier, reply and tell me. There are options.

— The SmartSwing AI Team$$)

ON CONFLICT (id) DO NOTHING;

-- ─── CADENCE 4: Club / Academy Outreach ──────────────────────────────────────
INSERT INTO public.cadence_emails (id, cadence_id, sequence_num, delay_days, email_type, subject, body_html, body_text)
VALUES
('e1000401-0000-0000-0000-000000000000',
 'a1000004-0000-0000-0000-000000000004',
 1, 0, 'intro',
 'How {{organization}} could reduce member churn by 28% this season',
$$<p>Hi {{first_name}},</p>
<p>I'll get straight to the point.</p>
<p>The #1 reason tennis club members cancel isn't cost — it's stagnation. They stop improving, so they stop valuing the membership.</p>
<p>Our data across 200+ clubs shows that when members receive regular, personalized feedback on their technique, <strong>12-month retention improves by 28% on average</strong>.</p>
<p>SmartSwing AI is how clubs are delivering that feedback at scale — without hiring additional coaching staff.</p>
<p><strong>Here's how it works for a club your size:</strong></p>
<ul>
  <li>Members upload swing videos from any device</li>
  <li>AI generates personalized biomechanics reports and drill plans in 60 seconds</li>
  <li>Your coaches review AI insights and add their own notes — 5 minutes per member</li>
  <li>Members receive branded progress reports they share with friends (organic referrals)</li>
</ul>
<p>Would a 20-minute call make sense to see if this fits your program?</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

The #1 reason club members cancel isn't cost — it's stagnation.

Data across 200+ clubs: regular personalized feedback = 28% better 12-month retention.

SmartSwing AI delivers that feedback at scale, without hiring additional staff.

For a 200-member club: 200 personalized touchpoints per month, 5 minutes per member for your staff.

Worth a 20-minute call? — The SmartSwing AI Team$$),

('e1000402-0000-0000-0000-000000000000',
 'a1000004-0000-0000-0000-000000000004',
 2, 4, 'followup',
 'The ROI math for tennis clubs (quick breakdown)',
$$<p>Hi {{first_name}},</p>
<p>Quick ROI breakdown for a 200-member club:</p>
<p><strong>Current state:</strong></p>
<ul>
  <li>Average annual member value: $1,800</li>
  <li>Quarterly churn: 8% (16 members)</li>
  <li>Annual revenue at risk: $28,800</li>
</ul>
<p><strong>With SmartSwing AI (Club plan: $299/month):</strong></p>
<ul>
  <li>Retention gain: ~$9,000/year</li>
  <li>Referral revenue from members sharing progress reports: ~$16,000/year</li>
  <li>Coach time savings: ~$18,720/year</li>
</ul>
<p><strong>Total annual value: ~$43,720 | Annual cost: $3,588 | ROI: 1,118%</strong></p>
<p>Would it be worth 20 minutes to walk through this for your specific numbers?</p>
<p><a href="mailto:contact@smartswingai.com?subject=Club ROI Discussion">Schedule a call →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

ROI for 200-member club:
- Retention gain: ~$9,000/year
- Referral revenue: ~$16,000/year
- Coach time savings: ~$18,720/year

Total value: ~$43,720 | Cost: $3,588/year | ROI: 1,118%

Worth 20 minutes to run your numbers?
contact@smartswingai.com — The SmartSwing AI Team$$),

('e1000403-0000-0000-0000-000000000000',
 'a1000004-0000-0000-0000-000000000004',
 3, 9, 'social_proof',
 'How Westchester Tennis Academy added 34 new members in one quarter',
$$<p>Hi {{first_name}},</p>
<p>Westchester Tennis Academy (340 members, 6 coaches) launched SmartSwing AI as their "Member Tech Benefit" in Q3.</p>
<p><strong>90-day results:</strong></p>
<ul>
  <li>Member churn dropped from 11% to 4% quarterly</li>
  <li>34 new member referrals attributed to members sharing AI reports</li>
  <li>Coaching staff saved 6.5 hours/week on session notes</li>
  <li>Junior program waitlist grew from 3 to 47 students</li>
</ul>
<p><em>"We'd been looking for a way to differentiate our membership offering without adding staff costs. SmartSwing became our most-talked-about member benefit within two months."</em></p>
<p>The pilot program we offered Westchester is available for three more clubs this quarter.</p>
<p>Would {{organization}} be a fit?</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Westchester Tennis Academy launched SmartSwing as their "Member Tech Benefit" in Q3.

90-day results:
- Churn: 11% → 4% quarterly
- 34 new member referrals from AI report sharing
- 6.5 hours/week saved by coaching staff
- Junior waitlist: 3 → 47 students

Pilot program available for three more clubs this quarter.

Would {{organization}} be a fit? — The SmartSwing AI Team$$),

('e1000404-0000-0000-0000-000000000000',
 'a1000004-0000-0000-0000-000000000004',
 4, 15, 'cta',
 'Pilot program offer — 60 days free for your club',
$$<p>Hi {{first_name}},</p>
<p>I'd like to offer {{organization}} a 60-day free pilot of SmartSwing AI Club.</p>
<p><strong>What's included:</strong></p>
<ul>
  <li>Full platform access for all coaches and up to 50 members</li>
  <li>White-label setup with your club's branding</li>
  <li>Dedicated onboarding call (60 min) for your coaching team</li>
  <li>Monthly ROI report showing retention impact</li>
  <li>No credit card required for the pilot period</li>
</ul>
<p>If at 60 days you don't see the impact, you walk away. No contract, no invoice.</p>
<p>91% of club pilots convert to annual plans.</p>
<p><a href="mailto:contact@smartswingai.com?subject=Club Pilot Program">Start the pilot conversation →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

60-day free pilot for {{organization}}:
- Full platform access for coaches + 50 members
- White-label setup with your branding
- Onboarding call for coaching team
- Monthly ROI reports
- No credit card required

If you don't see impact, you walk away. No contract. 91% of pilots convert.

contact@smartswingai.com — The SmartSwing AI Team$$),

('e1000405-0000-0000-0000-000000000000',
 'a1000004-0000-0000-0000-000000000004',
 5, 22, 'urgency',
 'Last pilot spot this quarter — closing Friday',
$$<p>Hi {{first_name}},</p>
<p>We have one pilot program slot remaining for this quarter, and I've been holding it for {{organization}}.</p>
<p>I'm closing the Q2 pilot cohort on Friday.</p>
<p>If Q2 doesn't work, just say the word and I'll follow up in 90 days with no hard feelings.</p>
<p>But if there's any chance this fits your Q2 priorities, a 15-minute call this week would be enough to figure out if it makes sense.</p>
<p>I can do Thursday at 2pm, 4pm, or Friday at 10am. Which works?</p>
<p>Just reply with the time and I'll send the invite.</p>
<p>— The SmartSwing AI Team</p>
<p>P.S. Prefer to self-onboard? <a href="https://smartswingai.com/for-clubs.html">smartswingai.com/for-clubs.html</a></p>$$,
$$Hi {{first_name}},

One pilot spot remaining for Q2 — holding it for {{organization}}. Closing Friday.

Thursday 2pm, Thursday 4pm, or Friday 10am — which works? Just reply.

P.S. Prefer to self-onboard? https://smartswingai.com/for-clubs.html

— The SmartSwing AI Team$$)

ON CONFLICT (id) DO NOTHING;

-- ─── CADENCE 5: Win-Back — Churned Players ───────────────────────────────────
INSERT INTO public.cadence_emails (id, cadence_id, sequence_num, delay_days, email_type, subject, body_html, body_text)
VALUES
('e1000501-0000-0000-0000-000000000000',
 'a1000005-0000-0000-0000-000000000005',
 1, 0, 'intro',
 'Your swing data is still here — but not for long',
$$<p>Hi {{first_name}},</p>
<p>You were analyzing your swing with SmartSwing AI a little while ago.</p>
<p>Your biomechanics data, your drill history, your improvement baseline — it's all still in your account. But we'll archive inactive accounts after 90 days.</p>
<p>Here's the thing: your baseline is the most valuable thing in your account. It's the before-photo that proves how much you've improved. Once it's gone, you can't get it back.</p>
<p>If you want to keep your data and pick up where you left off, you can reactivate in 30 seconds — no new onboarding, everything exactly where you left it.</p>
<p><a href="https://smartswingai.com/pricing.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Reactivate my account →</a></p>
<p>If there was something we could have done better, I genuinely want to know. Just reply.</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Your swing data is still in your account — but we archive inactive accounts after 90 days.

Your baseline is the before-photo that proves how much you've improved. Once it's gone, you can't get it back.

Reactivate in 30 seconds, everything where you left it:
https://smartswingai.com/pricing.html

If there was something we could have done better, reply and tell me.

— The SmartSwing AI Team$$),

('e1000502-0000-0000-0000-000000000000',
 'a1000005-0000-0000-0000-000000000005',
 2, 3, 'followup',
 'What we've added since you left',
$$<p>Hi {{first_name}},</p>
<p>A lot has changed at SmartSwing AI since you were last here.</p>
<p><strong>New features you haven't tried yet:</strong></p>
<ul>
  <li>AI Coach Chat — ask any technique question, get instant biomechanics-backed answers</li>
  <li>Serve analysis (new) — separate model trained specifically for serve mechanics</li>
  <li>Doubles tactics module — court positioning and partner communication scoring</li>
  <li>Weekly performance emails — your improvement trend delivered to your inbox every Monday</li>
</ul>
<p>And we've cut the price of the Player plan from $14.99 to $9.99.</p>
<p>Your old account, same email, same data. Just reactivate and keep going.</p>
<p><a href="https://smartswingai.com/pricing.html">Reactivate at $9.99/month →</a></p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

What's new since you left:
- AI Coach Chat — instant technique answers
- Serve analysis (new model)
- Doubles tactics module
- Weekly performance emails

Price also dropped: $14.99 → $9.99/month.

Your data is still there. Reactivate at $9.99/month:
https://smartswingai.com/pricing.html

— The SmartSwing AI Team$$),

('e1000503-0000-0000-0000-000000000000',
 'a1000005-0000-0000-0000-000000000005',
 3, 7, 'cta',
 'One month free — welcome back offer',
$$<p>Hi {{first_name}},</p>
<p>I want to make it easy for you to come back.</p>
<p>For the next 48 hours, use code <strong>COMEBACK</strong> at checkout to get your first month free.</p>
<p>That's $9.99 saved. Your data is still there. Your improvement streak can start today.</p>
<p><a href="https://smartswingai.com/pricing.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Reactivate free — use code COMEBACK</a></p>
<p>Offer expires in 48 hours.</p>
<p>— The SmartSwing AI Team</p>$$,
$$Hi {{first_name}},

Use code COMEBACK at checkout to get your first month free (48-hour offer).

Your data is still there. Your improvement streak can start today.

https://smartswingai.com/pricing.html

— The SmartSwing AI Team$$)

ON CONFLICT (id) DO NOTHING;

-- ─── Service role insert policy (if not already set) ─────────────────────────
-- The service role bypasses RLS, so no policy is needed for server-side writes.
-- Ensure anon/authenticated can read active cadences and their emails:

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='email_cadences' AND policyname='anon_read_email_cadences'
  ) THEN
    CREATE POLICY "anon_read_email_cadences"
      ON public.email_cadences FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cadence_emails' AND policyname='anon_read_cadence_emails'
  ) THEN
    CREATE POLICY "anon_read_cadence_emails"
      ON public.cadence_emails FOR SELECT
      USING (true);
  END IF;
END $$;
