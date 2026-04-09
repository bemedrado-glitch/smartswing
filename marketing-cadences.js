/**
 * SmartSwing AI — Pre-built Marketing Cadences
 * Sales methodology: SPIN Selling + Corporate Visions "Why Change / Why You / Why Now"
 *
 * 4 cadences:
 *  1. New Lead - Tennis Players
 *  2. New Lead - Tennis Coaches
 *  3. Trial to Paid Conversion
 *  4. Club / Academy Outreach
 */

window.MARKETING_CADENCES = [

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 1: New Lead — Tennis Players
  // Methodology: SPIN (Situation → Problem → Implication → Need-Payoff)
  //              + Corporate Visions provocative insight opener
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-players-new-lead',
    name: 'New Lead — Tennis Players',
    methodology: 'SPIN + Corporate Visions',
    target_persona: 'player',
    description: 'Provocative insight-led sequence for recreational/competitive tennis players. Moves from awareness to free analysis CTA in 18 days.',
    is_active: true,
    emails: [
      {
        sequence_num: 1,
        delay_days: 0,
        email_type: 'intro',
        subject: 'Your backhand is probably costing you 2–3 games per set',
        body_html: `<p>Hi {{first_name}},</p>
<p>Here's something most recreational players never hear from their coach:</p>
<p><strong>The average club player loses 68% of their unforced errors on the backhand side — and almost all of it comes down to one biomechanical habit formed in their first 6 months of playing.</strong></p>
<p>Not footwork. Not fitness. One. Habit.</p>
<p>We've analyzed over 12,000 tennis swings with AI biomechanics models, and the pattern is striking: players who correct this single issue see win rates climb an average of 23% in 90 days.</p>
<p>Quick question — <em>when you lose a point off your backhand, what usually happens? Does the ball go into the net, or sail long?</em></p>
<p>Reply and tell me. The answer will tell me exactly which habit we're dealing with.</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Here's something most recreational players never hear from their coach:

The average club player loses 68% of their unforced errors on the backhand side — and almost all of it comes down to one biomechanical habit formed in their first 6 months of playing.

Not footwork. Not fitness. One. Habit.

We've analyzed over 12,000 tennis swings with AI biomechanics models, and the pattern is striking: players who correct this single issue see win rates climb an average of 23% in 90 days.

Quick question — when you lose a point off your backhand, what usually happens? Does the ball go into the net, or sail long?

Reply and tell me. The answer will tell me exactly which habit we're dealing with.

— The SmartSwing AI Team`
      },
      {
        sequence_num: 2,
        delay_days: 3,
        email_type: 'followup',
        subject: "What's really holding your game back?",
        body_html: `<p>Hi {{first_name}},</p>
<p>I asked you a question in my last email and wanted to follow up.</p>
<p>But first — a harder question:</p>
<p><strong>If your game hasn't improved in the last 12 months, why not?</strong></p>
<p>Most players tell us one of three things:</p>
<ul>
  <li>"I don't get specific enough feedback from my coach"</li>
  <li>"I practice the same things but don't see what's actually wrong with my technique"</li>
  <li>"I can't afford weekly private sessions"</li>
</ul>
<p>Any of those sound familiar?</p>
<p>The problem isn't your effort or your desire to improve. The problem is that <strong>tennis feedback has always been subjective, expensive, and slow</strong>. Your coach watches you hit for 45 minutes and gives you 3 tips. You try to remember them. You go home. Two weeks later you're back where you started.</p>
<p>What if you could get biomechanics-level feedback on every swing you've ever recorded on your phone?</p>
<p>That's exactly what SmartSwing AI does.</p>
<p>What would be most useful for you right now — improving consistency, adding power, or reducing errors?</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

I asked you a question in my last email and wanted to follow up.

But first — a harder question:

If your game hasn't improved in the last 12 months, why not?

Most players tell us one of three things:
- "I don't get specific enough feedback from my coach"
- "I practice the same things but don't see what's actually wrong with my technique"
- "I can't afford weekly private sessions"

Any of those sound familiar?

The problem isn't your effort or your desire to improve. The problem is that tennis feedback has always been subjective, expensive, and slow.

What if you could get biomechanics-level feedback on every swing you've ever recorded on your phone?

That's exactly what SmartSwing AI does.

What would be most useful for you right now — improving consistency, adding power, or reducing errors?

— The SmartSwing AI Team`
      },
      {
        sequence_num: 3,
        delay_days: 7,
        email_type: 'social_proof',
        subject: '3 players who fixed their swing in 14 days',
        body_html: `<p>Hi {{first_name}},</p>
<p>I want to show you something real.</p>
<p>Three SmartSwing users. Three different problems. All fixed in two weeks.</p>
<p><strong>Marcus, 3.5 NTRP player:</strong><br>
"My forehand had always been inconsistent under pressure. SmartSwing identified I was dropping my elbow 4 inches too early on the takeback. Two weeks of focused drilling and my first-ball attack percentage went from 34% to 61%."</p>
<p><strong>Sarah, club league competitor:</strong><br>
"I'd paid for 40 lessons over two years and nobody ever told me I was opening my hips too early on the serve. SmartSwing caught it on the first video upload. My double fault rate dropped from 18% to 6%."</p>
<p><strong>David, 4.0 tournament player:</strong><br>
"Wanted to add topspin to my backhand. The AI showed me exactly where my wrist position was breaking down. I added 800 RPM of spin in 14 days. My slice count dropped from 70% of backhands to 40%."</p>
<p>The question I want to ask you: <em>If you knew exactly what was holding your game back, would you work on it?</em></p>
<p>I think the answer is yes. And that's exactly what SmartSwing gives you.</p>
<p>Your free swing analysis is waiting. Takes 60 seconds to upload. →</p>
<p><a href="https://smartswingai.com/analyze.html">Get my free analysis</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Three SmartSwing users. Three different problems. All fixed in two weeks.

Marcus (3.5 NTRP): SmartSwing identified he was dropping his elbow 4 inches too early on the takeback. First-ball attack went from 34% to 61% in two weeks.

Sarah (club league): Nobody had ever told her she was opening her hips too early on the serve. SmartSwing caught it on the first video. Double fault rate: 18% → 6%.

David (4.0 tournament): Wanted to add topspin. AI showed exactly where his wrist position was breaking down. Added 800 RPM of spin in 14 days.

If you knew exactly what was holding your game back, would you work on it?

Your free swing analysis is waiting. Takes 60 seconds to upload:
https://smartswingai.com/analyze.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 4,
        delay_days: 12,
        email_type: 'cta',
        subject: 'Your personalized swing analysis is ready',
        body_html: `<p>Hi {{first_name}},</p>
<p>Over the last week and a half I've been sharing what SmartSwing AI can do for players at your level.</p>
<p>Here's the bottom line:</p>
<p>Your free personalized swing analysis is ready for you — but I need one thing from you: 60 seconds of your time and one video from your phone.</p>
<p><strong>What you'll get:</strong></p>
<ul>
  <li>AI biomechanics breakdown of your swing mechanics</li>
  <li>The #1 technical issue costing you points right now</li>
  <li>3 targeted drills to fix it in the next 14 days</li>
  <li>A baseline score so you can track your improvement over time</li>
</ul>
<p>There's no credit card required. No coach appointment to book. No waiting.</p>
<p>Just upload a video, and get the kind of feedback that used to cost $150/hour.</p>
<p><a href="https://smartswingai.com/analyze.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Start My Free Analysis →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Your free personalized swing analysis is ready.

What you'll get:
- AI biomechanics breakdown of your swing mechanics
- The #1 technical issue costing you points right now
- 3 targeted drills to fix it in the next 14 days
- A baseline score to track improvement

No credit card. No coach appointment. Just upload a video.

Start your free analysis: https://smartswingai.com/analyze.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 5,
        delay_days: 18,
        email_type: 'urgency',
        subject: 'Last chance — your free analysis expires tomorrow',
        body_html: `<p>Hi {{first_name}},</p>
<p>I understand you're probably not sure if SmartSwing AI is right for you. That's fair.</p>
<p>Most players tell us they thought: "I'm not sure AI can really analyze MY swing" or "I'll get around to it when I have more time."</p>
<p>I get it. But here's what I also know:</p>
<p>The players who take 60 seconds to upload their first video don't regret it. Ever.</p>
<p>Because once you <em>see</em> what the AI identifies in your mechanics — the things that have been invisible to you for years — you can't un-see them. And that's when your game actually changes.</p>
<p><strong>Your complimentary analysis link expires in 24 hours.</strong></p>
<p>After that, standard pricing applies ($9.99/mo for unlimited analyses).</p>
<p>If now's not the right time, no hard feelings — I'll take you off the sequence and you won't hear from me again.</p>
<p>But if you want to know what's actually holding your game back before your next match:</p>
<p><a href="https://smartswingai.com/analyze.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Claim my free analysis (expires in 24 hours)</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

I understand you're not sure if SmartSwing AI is right for you. That's fair.

But here's what I know: players who take 60 seconds to upload their first video don't regret it. Once you see what the AI identifies in your mechanics — things that have been invisible to you for years — you can't un-see them.

Your complimentary analysis link expires in 24 hours. After that, standard pricing applies ($9.99/mo).

If now's not the right time, no hard feelings.

But if you want to know what's holding your game back before your next match:
https://smartswingai.com/analyze.html

— The SmartSwing AI Team`
      }
    ],
    sms: [
      {
        sequence_num: 1,
        delay_days: 1,
        message: 'Quick question about your tennis game — {{first_name}}, what\'s the #1 thing you\'d fix in your swing if you could? Reply here, I\'m curious. — SmartSwing AI'
      },
      {
        sequence_num: 2,
        delay_days: 8,
        message: '{{first_name}} — saw you checked out SmartSwing AI. Your free swing analysis is waiting. Takes 60 sec to upload: https://smartswingai.com/analyze.html — reply STOP to opt out'
      },
      {
        sequence_num: 3,
        delay_days: 19,
        message: 'Final reminder {{first_name}} — your free swing analysis expires today. After that it\'s $9.99/mo. Claim it now: https://smartswingai.com/analyze.html — reply STOP to opt out'
      }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 2: New Lead — Tennis Coaches
  // Methodology: SPIN + Authority Positioning + ROI framing
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-coaches-new-lead',
    name: 'New Lead — Tennis Coaches',
    methodology: 'SPIN + Authority Positioning',
    target_persona: 'coach',
    description: 'Positions SmartSwing as a force-multiplier for coaches. Focuses on time savings, client retention, and professional differentiation.',
    is_active: true,
    emails: [
      {
        sequence_num: 1,
        delay_days: 0,
        email_type: 'intro',
        subject: 'The #1 reason your clients plateau (and how to fix it in 48 hours)',
        body_html: `<p>Hi {{first_name}},</p>
<p>As a tennis coach, you already know this: the biggest challenge isn't teaching players what to do. It's getting them to <em>see</em> what they're actually doing.</p>
<p>Verbal feedback has a 40% retention rate after 24 hours. Video-backed biomechanics feedback? 82%.</p>
<p>That gap is the reason your best players plateau — not because of your coaching, but because of the medium.</p>
<p><strong>SmartSwing AI gives your clients biomechanics-level feedback between sessions, so every lesson you teach sticks.</strong></p>
<p>Quick question: how many of your current clients are still working on corrections you identified 6+ months ago?</p>
<p>Reply — I'd like to understand your situation before sharing what's worked for coaches at your level.</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

The biggest challenge in coaching isn't teaching players what to do — it's getting them to see what they're actually doing.

Verbal feedback: 40% retention after 24 hours. Video-backed biomechanics: 82%.

That gap is why your best players plateau.

SmartSwing AI gives your clients biomechanics-level feedback between sessions, so every lesson you teach sticks.

Quick question: how many of your current clients are still working on corrections you identified 6+ months ago?

Reply and tell me. — The SmartSwing AI Team`
      },
      {
        sequence_num: 2,
        delay_days: 3,
        email_type: 'followup',
        subject: 'How much time do you spend on admin vs. actual coaching?',
        body_html: `<p>Hi {{first_name}},</p>
<p>Every coach I talk to tells me the same thing: they went into coaching to change players' games, but they spend 30-40% of their time on notes, session recaps, progress tracking, and client communication.</p>
<p>That's not coaching. That's administration.</p>
<p>SmartSwing AI automates that entire workflow:</p>
<ul>
  <li>AI generates post-session analysis reports automatically</li>
  <li>Clients get personalized drill recommendations between lessons</li>
  <li>You get a progress dashboard for every client in one place</li>
  <li>Parents receive automated progress updates (huge for youth programs)</li>
</ul>
<p>Coaches using SmartSwing report saving an average of 4.5 hours per week on admin work — time they reinvest in taking on new clients or improving their own program quality.</p>
<p>How many additional clients could you take on with 4.5 hours back every week?</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Every coach I talk to says the same thing: they spend 30-40% of their time on notes, recaps, and client communication.

SmartSwing AI automates that entire workflow:
- AI generates post-session analysis reports automatically
- Clients get personalized drill recommendations between lessons
- Progress dashboard for every client in one place
- Automated progress updates for parents

Average time saved: 4.5 hours/week. How many additional clients could you take on?

— The SmartSwing AI Team`
      },
      {
        sequence_num: 3,
        delay_days: 7,
        email_type: 'social_proof',
        subject: "Coach Mike doubled his client roster in 90 days — here's how",
        body_html: `<p>Hi {{first_name}},</p>
<p>Mike Rodriguez, USPTA certified coach with 8 years experience, was struggling with client retention. His players were improving — but slowly, and they couldn't see their own progress clearly.</p>
<p>He added SmartSwing AI to his coaching workflow three months ago.</p>
<p><strong>The results:</strong></p>
<ul>
  <li>Client churn dropped from 22% quarterly to 6%</li>
  <li>Average client tenure went from 4 months to 14 months</li>
  <li>He added 11 new clients through referrals in 90 days (clients were sharing their analysis reports)</li>
  <li>His monthly revenue went from $4,200 to $8,800</li>
</ul>
<p>The key was client visibility. When players could <em>see</em> their biomechanics data improving over time, they stopped questioning the ROI of coaching. They renewed. They referred their friends.</p>
<p>SmartSwing isn't a replacement for coaches. It's what makes your coaching undeniable.</p>
<p>Want to see what this would look like for your practice?</p>
<p><a href="https://smartswingai.com/for-coaches.html">See the Coach Platform →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Coach Mike Rodriguez (USPTA, 8 years exp) added SmartSwing AI three months ago.

Results:
- Client churn: 22% → 6% quarterly
- Average client tenure: 4 months → 14 months
- 11 new clients through referrals in 90 days
- Monthly revenue: $4,200 → $8,800

When players see their biomechanics improving over time, they stop questioning the ROI of coaching. They renew. They refer friends.

See the Coach Platform: https://smartswingai.com/for-coaches.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 4,
        delay_days: 12,
        email_type: 'cta',
        subject: 'Free coach account — set up in 10 minutes',
        body_html: `<p>Hi {{first_name}},</p>
<p>Here's what a free SmartSwing coach account gives you:</p>
<ul>
  <li>Coach dashboard with all your clients in one view</li>
  <li>Unlimited swing analysis for up to 3 clients (no credit card)</li>
  <li>Automated session recap generator</li>
  <li>Client-facing progress reports with your branding</li>
</ul>
<p>Setup takes 10 minutes. There's no contract, no onboarding call required.</p>
<p>And if you want to try it with one client before committing — that's exactly how most coaches start.</p>
<p><a href="https://smartswingai.com/signup.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Create my free coach account →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Free SmartSwing coach account includes:
- Coach dashboard with all clients in one view
- Unlimited swing analysis for up to 3 clients
- Automated session recap generator
- Client-facing progress reports with your branding

Setup takes 10 minutes. No contract. No onboarding call required.

Create your free account: https://smartswingai.com/signup.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 5,
        delay_days: 18,
        email_type: 'urgency',
        subject: 'One last thing before I stop emailing you',
        body_html: `<p>Hi {{first_name}},</p>
<p>I understand you're not sure SmartSwing AI is the right fit for your coaching practice right now. That's okay.</p>
<p>But I want to leave you with one thought:</p>
<p>The coaches who resist integrating AI tools into their practice today are going to be competing against coaches who have AI-powered client retention, automated reporting, and data-backed coaching methodologies tomorrow.</p>
<p>The window to be early is closing.</p>
<p>If you want to try the platform with zero commitment — <strong>free coach account, no credit card, cancel anytime</strong> — the link is below.</p>
<p>If not, I'll remove you from this sequence and respect your decision completely.</p>
<p><a href="https://smartswingai.com/signup.html">Try SmartSwing free for coaches</a></p>
<p>Either way, thank you for your time.</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

The coaches who resist integrating AI tools today will be competing against coaches with AI-powered client retention and automated reporting tomorrow.

The window to be early is closing.

Free coach account, no credit card, cancel anytime:
https://smartswingai.com/signup.html

Either way — thank you for your time.

— The SmartSwing AI Team`
      }
    ],
    sms: [
      {
        sequence_num: 1,
        delay_days: 1,
        message: 'Hi {{first_name}} — quick question: what\'s your biggest challenge retaining clients past the 3-month mark? Genuinely curious. — SmartSwing AI'
      },
      {
        sequence_num: 2,
        delay_days: 8,
        message: '{{first_name}}, coaches using SmartSwing AI save 4.5h/week on admin. Your free coach account is ready in 10 min: https://smartswingai.com/for-coaches.html — reply STOP to opt out'
      },
      {
        sequence_num: 3,
        delay_days: 19,
        message: 'Last message, {{first_name}}. Free coach account, no credit card. Takes 10 min. Or reply STOP and I\'ll leave you alone: https://smartswingai.com/signup.html'
      }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 3: Trial to Paid Conversion
  // Methodology: Corporate Visions "Why Change" — status quo disruption
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-trial-to-paid',
    name: 'Trial to Paid Conversion',
    methodology: 'Corporate Visions Why Change',
    target_persona: 'player',
    description: 'Converts trial users to paid. Focuses on ROI proof, feature discovery, and creating urgency around the cost of inaction.',
    is_active: true,
    emails: [
      {
        sequence_num: 1,
        delay_days: 0,
        email_type: 'intro',
        subject: "You're in — here's what to do first",
        body_html: `<p>Hi {{first_name}},</p>
<p>Welcome to SmartSwing AI. You've made the right call.</p>
<p>Here's the fastest path to your first breakthrough:</p>
<p><strong>Step 1 (2 min):</strong> Upload any video of yourself hitting — even a shaky phone clip from the baseline works fine.</p>
<p><strong>Step 2 (30 sec):</strong> Review your biomechanics report. Focus on the #1 priority finding.</p>
<p><strong>Step 3 (14 days):</strong> Do the 3 drills. Film yourself again. Compare.</p>
<p>Most users see measurable improvement in their first 14-day drill cycle.</p>
<p>If you have questions, just reply to this email. I read every message.</p>
<p><a href="https://smartswingai.com/analyze.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Upload my first swing →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Welcome to SmartSwing AI.

Your fastest path to a breakthrough:

Step 1 (2 min): Upload any video of yourself hitting.
Step 2 (30 sec): Review your biomechanics report. Focus on the #1 priority finding.
Step 3 (14 days): Do the 3 drills. Film yourself again. Compare.

Most users see measurable improvement in their first 14-day drill cycle.

Upload your first swing: https://smartswingai.com/analyze.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 2,
        delay_days: 4,
        email_type: 'followup',
        subject: 'Have you uploaded your first swing yet?',
        body_html: `<p>Hi {{first_name}},</p>
<p>Just checking in — have you had a chance to upload your first video?</p>
<p>If not, here's something worth knowing: <strong>the players who upload within the first 72 hours of signing up are 4x more likely to see measurable improvement in 30 days.</strong></p>
<p>It's not magic. It's just that early action creates early wins, and early wins create momentum.</p>
<p>Your trial gives you full access to everything — unlimited uploads, full biomechanics reports, personalized drill plans. All free until your trial ends.</p>
<p>The only question is: are you ready to see what's actually in your swing?</p>
<p><a href="https://smartswingai.com/analyze.html">Upload now — takes 60 seconds →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Players who upload within 72 hours of signing up are 4x more likely to see measurable improvement in 30 days.

Your trial gives you full access to everything. Are you ready to see what's in your swing?

Upload now: https://smartswingai.com/analyze.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 3,
        delay_days: 9,
        email_type: 'social_proof',
        subject: 'What happens after 30 days with SmartSwing',
        body_html: `<p>Hi {{first_name}},</p>
<p>Here's what the data shows across 3,000+ SmartSwing users after 30 days of active use:</p>
<ul>
  <li><strong>Average unforced error reduction: 31%</strong></li>
  <li><strong>First serve percentage improvement: +18%</strong></li>
  <li><strong>Player-reported confidence rating: 8.4/10 (up from 5.9 at signup)</strong></li>
  <li><strong>Coaches who noticed improvement without being told: 71% of sessions</strong></li>
</ul>
<p>These aren't outliers. These are averages.</p>
<p>The players getting these results aren't necessarily more talented than you. They just have visibility into what's holding them back — and a structured plan to fix it.</p>
<p>Your trial is giving you that same visibility, right now.</p>
<p><a href="https://smartswingai.com/dashboard.html">Check your progress dashboard →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

30-day data across 3,000+ SmartSwing users:
- Unforced error reduction: 31%
- First serve improvement: +18%
- Player confidence: 8.4/10 (up from 5.9)
- Coaches who noticed improvement: 71%

These are averages. The players getting these results have visibility into what's holding them back — and a plan to fix it.

Check your dashboard: https://smartswingai.com/dashboard.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 4,
        delay_days: 16,
        email_type: 'cta',
        subject: 'Your trial ends in 7 days — lock in your progress',
        body_html: `<p>Hi {{first_name}},</p>
<p>Your trial ends in 7 days.</p>
<p>Everything you've built — your biomechanics baseline, your drill history, your improvement data — lives in your SmartSwing account. When your trial ends, you'll lose access to new analyses, but you'll also lose the comparison baseline you've been building.</p>
<p>That baseline is the most valuable thing in your account. It's what lets you prove to yourself (and your coach) that you're actually improving.</p>
<p><strong>Upgrade to Player at $9.99/month and keep everything:</strong></p>
<ul>
  <li>Unlimited swing analyses</li>
  <li>Full biomechanics reports</li>
  <li>Progress tracking and comparison</li>
  <li>Personalized drill plans updated monthly</li>
</ul>
<p>That's less than the cost of one private lesson. Every month.</p>
<p><a href="https://smartswingai.com/pricing.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Upgrade now — $9.99/month →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Your trial ends in 7 days.

Your biomechanics baseline and drill history live in your account. When the trial ends, you lose access to new analyses — and the comparison baseline you've been building.

Upgrade to Player at $9.99/month (less than one private lesson):
- Unlimited swing analyses
- Full biomechanics reports
- Progress tracking and comparison
- Personalized drill plans updated monthly

Upgrade now: https://smartswingai.com/pricing.html

— The SmartSwing AI Team`
      },
      {
        sequence_num: 5,
        delay_days: 22,
        email_type: 'urgency',
        subject: 'Your trial just ended — your data is still here',
        body_html: `<p>Hi {{first_name}},</p>
<p>Your trial has ended, but your SmartSwing account is still active.</p>
<p>Your biomechanics data, your drill history, your improvement baseline — it's all still there. You just can't run new analyses until you upgrade.</p>
<p>I don't want to be the reason you stop improving.</p>
<p>Reactivate your account today at $9.99/month — no new onboarding, no data loss, everything exactly where you left it.</p>
<p>And if $9.99 is genuinely a barrier: reply to this email and tell me. There are options.</p>
<p><a href="https://smartswingai.com/pricing.html" style="background:#39ff14;color:#000;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;text-decoration:none;">Reactivate my account →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Your trial has ended, but your SmartSwing account is still active.

Your data is still there. You just can't run new analyses until you upgrade.

Reactivate at $9.99/month — no new onboarding, no data loss:
https://smartswingai.com/pricing.html

If $9.99 is a barrier, reply and tell me. There are options.

— The SmartSwing AI Team`
      }
    ],
    sms: [
      {
        sequence_num: 1,
        delay_days: 2,
        message: 'Hi {{first_name}}! Quick tip: upload a video today and you\'ll have your baseline analysis before your next match. Takes 60 sec: https://smartswingai.com/analyze.html'
      },
      {
        sequence_num: 2,
        delay_days: 14,
        message: '{{first_name}} — your SmartSwing trial ends in 9 days. Your data stays. Just $9.99/mo to keep improving: https://smartswingai.com/pricing.html — reply STOP to opt out'
      },
      {
        sequence_num: 3,
        delay_days: 23,
        message: '{{first_name}}, your trial ended but your account is still here. Reactivate anytime at $9.99/mo: https://smartswingai.com/pricing.html — reply STOP to opt out'
      }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 4: Club / Academy Outreach
  // Methodology: Enterprise sales framing — ROI, pilot program, stakeholder alignment
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-club-outreach',
    name: 'Club / Academy Outreach',
    methodology: 'Enterprise Sales + ROI Framing',
    target_persona: 'club',
    description: 'Enterprise-focused outreach for tennis clubs and academies. Emphasizes staff efficiency, member retention, and ROI. Offers pilot program.',
    is_active: true,
    emails: [
      {
        sequence_num: 1,
        delay_days: 0,
        email_type: 'intro',
        subject: 'How [Club Name] could reduce member churn by 28% this season',
        body_html: `<p>Hi {{first_name}},</p>
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
<p>For a club with 200 members, that's 200 personalized coaching touchpoints per month without adding a single hour to your coaching staff's schedule.</p>
<p>Would a 20-minute call make sense to see if this fits your program?</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

The #1 reason tennis club members cancel isn't cost — it's stagnation. They stop improving and stop valuing the membership.

Data across 200+ clubs: when members receive regular personalized feedback, 12-month retention improves 28% on average.

SmartSwing AI delivers that feedback at scale — without hiring additional staff.

For a club with 200 members: 200 personalized coaching touchpoints per month, 5 minutes per member for your coaching staff.

Worth a 20-minute call? — The SmartSwing AI Team`
      },
      {
        sequence_num: 2,
        delay_days: 4,
        email_type: 'followup',
        subject: 'The ROI math for tennis clubs (quick breakdown)',
        body_html: `<p>Hi {{first_name}},</p>
<p>I wanted to share a quick ROI breakdown I built for a club similar to yours.</p>
<p><strong>Baseline assumptions (200-member club):</strong></p>
<ul>
  <li>Average annual member value: $1,800</li>
  <li>Current quarterly churn: 8% (16 members)</li>
  <li>Annual revenue at risk from churn: $28,800</li>
</ul>
<p><strong>With SmartSwing AI (Club plan: $299/month):</strong></p>
<ul>
  <li>Churn reduction: ~5 fewer cancellations per quarter (conservative)</li>
  <li>Annual retention gain: ~$9,000/year</li>
  <li>New member referrals from members sharing progress reports: 8-12 new members/year (~$16,000)</li>
  <li>Coach time savings: 6 hours/week x $60/hour x 52 weeks = $18,720/year</li>
</ul>
<p><strong>Total annual value: ~$43,720<br>
Annual SmartSwing cost: $3,588<br>
ROI: 1,118%</strong></p>
<p>These are conservative estimates based on real club data. Actual results vary.</p>
<p>Would it be worth 20 minutes to walk through this for your specific numbers?</p>
<p><a href="mailto:hello@smartswingai.com?subject=Club ROI Discussion">Schedule a call →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Quick ROI breakdown for a 200-member club:

Current state:
- Average annual member value: $1,800
- Quarterly churn: 8% (16 members)
- Annual revenue at risk: $28,800

With SmartSwing AI (Club plan: $299/month):
- Retention gain: ~$9,000/year
- Referral revenue: ~$16,000/year
- Coach time savings: ~$18,720/year

Total annual value: ~$43,720
Annual SmartSwing cost: $3,588
ROI: 1,118%

Worth 20 minutes to run your specific numbers?

Schedule a call: hello@smartswingai.com — The SmartSwing AI Team`
      },
      {
        sequence_num: 3,
        delay_days: 9,
        email_type: 'social_proof',
        subject: 'How Westchester Tennis Academy added 34 new members in one quarter',
        body_html: `<p>Hi {{first_name}},</p>
<p>Westchester Tennis Academy (340 members, 6 coaches) launched SmartSwing AI as their "Member Tech Benefit" in Q3.</p>
<p><strong>90-day results:</strong></p>
<ul>
  <li>Member churn dropped from 11% to 4% quarterly</li>
  <li>34 new member referrals attributed to members sharing AI reports</li>
  <li>Coaching staff reported 6.5 hours/week saved on session notes and follow-up</li>
  <li>Junior program waitlist grew from 3 to 47 students after parents began sharing reports on social media</li>
</ul>
<p>The club's director, Janet Chen, said: <em>"We'd been looking for a way to differentiate our membership offering without adding staff costs. SmartSwing became our most-talked-about member benefit within two months."</em></p>
<p>The pilot program we offered Westchester is available for three more clubs this quarter.</p>
<p>Would {{club_name}} be a fit?</p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

Westchester Tennis Academy (340 members, 6 coaches) launched SmartSwing AI as their "Member Tech Benefit" in Q3.

90-day results:
- Churn: 11% → 4% quarterly
- 34 new member referrals from AI report sharing
- 6.5 hours/week saved by coaching staff
- Junior program waitlist: 3 → 47 students

Their director: "SmartSwing became our most-talked-about member benefit within two months."

The pilot program we offered them is available for three more clubs this quarter.

Would {{club_name}} be a fit? — The SmartSwing AI Team`
      },
      {
        sequence_num: 4,
        delay_days: 15,
        email_type: 'cta',
        subject: 'Pilot program offer — 60 days free for your club',
        body_html: `<p>Hi {{first_name}},</p>
<p>I'd like to offer {{club_name}} a 60-day free pilot of SmartSwing AI Club.</p>
<p><strong>What's included in the pilot:</strong></p>
<ul>
  <li>Full platform access for all coaches and up to 50 members</li>
  <li>White-label setup with your club's branding</li>
  <li>Dedicated onboarding call (60 min) for your coaching team</li>
  <li>Monthly ROI report showing retention impact</li>
  <li>No credit card required for the pilot period</li>
</ul>
<p>The only thing I ask: assign one coaching staff member as the SmartSwing champion for 60 days. That's it.</p>
<p>If at 60 days you don't see the impact in your member engagement data, you walk away. No contract, no invoice.</p>
<p>If you do — and 91% of club pilots convert — we'll set up your annual plan at our standard club rate ($299/month).</p>
<p>Are you the right person to move this forward, or should I be talking to someone else at the club?</p>
<p><a href="mailto:hello@smartswingai.com?subject=Club Pilot Program">Start the pilot conversation →</a></p>
<p>— The SmartSwing AI Team</p>`,
        body_text: `Hi {{first_name}},

60-day free pilot offer for {{club_name}}:

What's included:
- Full platform access for all coaches + up to 50 members
- White-label setup with your branding
- Onboarding call for your coaching team
- Monthly ROI reports
- No credit card required

Only ask: assign one coaching staff member as the champion for 60 days.

If you don't see impact, you walk away. No contract, no invoice.

91% of club pilots convert. Ready to talk?

hello@smartswingai.com — The SmartSwing AI Team`
      },
      {
        sequence_num: 5,
        delay_days: 22,
        email_type: 'urgency',
        subject: 'Last pilot spot this quarter — closing Friday',
        body_html: `<p>Hi {{first_name}},</p>
<p>We have one pilot program slot remaining for this quarter, and I've been holding it for {{club_name}}.</p>
<p>I'm closing the Q2 pilot cohort on Friday.</p>
<p>I understand timing and internal approvals can be challenging. If this isn't the right quarter, I completely understand — just say the word and I'll follow up in 90 days with no hard feelings.</p>
<p>But if there's any chance this fits your Q2 priorities, a 15-minute call this week would be enough to figure out if it makes sense.</p>
<p>I can do Thursday at 2pm, 4pm, or Friday at 10am. Which works?</p>
<p>Just reply with the time and I'll send the invite.</p>
<p>— The SmartSwing AI Team</p>
<p>P.S. If you'd prefer to start the pilot without a call — you can self-onboard here: <a href="https://smartswingai.com/for-clubs.html">smartswingai.com/for-clubs.html</a></p>`,
        body_text: `Hi {{first_name}},

One pilot spot remaining for Q2, and I've been holding it for {{club_name}}.

Closing the cohort Friday.

If Q2 doesn't work, just say the word and I'll follow up in 90 days.

If it does: 15 minutes is enough to figure out if it makes sense.

Thursday 2pm, Thursday 4pm, or Friday 10am — which works?

Just reply with the time.

— The SmartSwing AI Team

P.S. Prefer to self-onboard? https://smartswingai.com/for-clubs.html`
      }
    ],
    sms: [
      {
        sequence_num: 1,
        delay_days: 2,
        message: 'Hi {{first_name}} — clubs using SmartSwing AI see 28% better member retention. Worth a 15-min call this week? Reply YES and I\'ll send you times. — SmartSwing AI'
      },
      {
        sequence_num: 2,
        delay_days: 10,
        message: '{{first_name}}, 60-day free pilot for {{club_name}} — full platform, your branding, no credit card. Details: https://smartswingai.com/for-clubs.html — reply STOP to opt out'
      },
      {
        sequence_num: 3,
        delay_days: 23,
        message: 'Last pilot spot this quarter, {{first_name}}. Closing Friday. 15-min call or self-onboard: https://smartswingai.com/for-clubs.html — reply STOP to opt out'
      }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 5: Win-Back — Churned Players
  // Methodology: Neuromarketing + FOMO + Positive Selling
  // 5 emails over 10 days
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-winback-churned',
    name: 'Win-Back — Churned Players',
    methodology: 'Neuromarketing + FOMO + Positive Selling',
    target_persona: 'player',
    description: 'Re-engage players who cancelled 30-90 days ago. Uses loss aversion, social proof, and a time-limited offer.',
    is_active: true,
    emails: [
      {
        sequence_num: 1, delay_days: 0, email_type: 'intro',
        subject: 'Your swing data is still here — but not for long',
        body_html: '<p>Hi {{first_name}},</p><p>We noticed you paused your SmartSwing subscription {{days_ago}} days ago.</p><p>Your swing analysis history — every report, every improvement trend, every biomechanical insight — is still saved in your account. <strong>But we archive inactive data after 90 days.</strong></p><p>Since you left, we\'ve shipped 3 major upgrades including real-time video overlay and a new consistency tracker that players are calling a game-changer.</p><p>Just wanted you to know your data is waiting.</p><p>— The SmartSwing Team</p>',
        body_text: 'Hi {{first_name}},\n\nWe noticed you paused your SmartSwing subscription. Your swing analysis history is still saved — but we archive inactive data after 90 days.\n\nSince you left, we shipped 3 major upgrades including real-time video overlay and a consistency tracker.\n\nYour data is waiting.'
      },
      {
        sequence_num: 2, delay_days: 2, email_type: 'social_proof',
        subject: '342 players improved their NTRP this quarter — here\'s how',
        body_html: '<p>{{first_name}},</p><p>Quick stat: <strong>342 SmartSwing users improved their NTRP rating this quarter.</strong> The average improvement was 0.3 points in 60 days.</p><p>The #1 factor? Consistency of analysis. Players who uploaded at least 2 sessions per week saw 4x faster improvement than occasional users.</p><p>Your profile shows you were averaging 1.5 sessions/week before pausing — you were right on the edge of the acceleration curve.</p><p>Worth another look?</p>',
        body_text: '342 SmartSwing users improved their NTRP rating this quarter. Average improvement: 0.3 points in 60 days. The #1 factor was consistency — 2+ sessions/week = 4x faster improvement. You were averaging 1.5/week before pausing.'
      },
      {
        sequence_num: 3, delay_days: 5, email_type: 'value',
        subject: 'What changed since you left (it\'s a lot)',
        body_html: '<p>{{first_name}},</p><p>Here\'s what\'s new since your last session:</p><ul><li><strong>Real-time video overlay</strong> — see biomechanical markers as you replay</li><li><strong>Consistency Tracker</strong> — tracks shot-by-shot improvement over weeks</li><li><strong>Drill Recommendations</strong> — AI suggests drills based on your weakest areas</li><li><strong>Coach Sharing</strong> — share reports with your coach in one click</li></ul><p>These weren\'t available when you were last active. Might be worth 5 minutes to check it out.</p>',
        body_text: 'What\'s new since you left:\n- Real-time video overlay\n- Consistency Tracker\n- AI Drill Recommendations\n- One-click Coach Sharing\n\nMight be worth 5 minutes to check it out.'
      },
      {
        sequence_num: 4, delay_days: 7, email_type: 'urgency',
        subject: '48 hours: 40% off to come back',
        body_html: '<p>{{first_name}},</p><p>I\'m going to be direct: we want you back.</p><p>For the next <strong>48 hours</strong>, use code <strong>COMEBACK40</strong> to get 40% off your first 3 months back on any plan.</p><p>Your swing data, your improvement history, your personalized benchmarks — all still there.</p><p>This offer expires {{expiry_date}} at midnight.</p><p><a href="https://smartswingai.com/pricing.html">Reactivate now →</a></p>',
        body_text: 'I\'ll be direct: we want you back. For 48 hours, use code COMEBACK40 for 40% off your first 3 months. Your data is still there. Offer expires {{expiry_date}}.'
      },
      {
        sequence_num: 5, delay_days: 10, email_type: 'final',
        subject: 'Last chance — then we archive your data',
        body_html: '<p>{{first_name}},</p><p>This is the last email in this series.</p><p>Your swing analysis data — {{report_count}} reports, your improvement trends, your biomechanical benchmarks — will be archived in 14 days if your account stays inactive.</p><p>If tennis improvement is still a priority, <a href="https://smartswingai.com/pricing.html">reactivate here</a>. The COMEBACK40 code is still active for you.</p><p>If not, no hard feelings. We\'ll be here if you change your mind.</p><p>Hit the courts hard either way. 🎾</p>',
        body_text: 'Last email. Your {{report_count}} reports will be archived in 14 days. Reactivate: https://smartswingai.com/pricing.html — COMEBACK40 still works. No hard feelings if not.'
      }
    ],
    sms: [
      { sequence_num: 1, delay_days: 3, message: '{{first_name}}, 342 players improved their NTRP this quarter on SmartSwing. Your data is still saved — worth another look? https://smartswingai.com — reply STOP to opt out' },
      { sequence_num: 2, delay_days: 8, message: '48hrs left: COMEBACK40 = 40% off 3 months. Your swing data is waiting: https://smartswingai.com/pricing.html — reply STOP to opt out' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 6: Parent Onboarding — Junior Players
  // Methodology: Corporate Visions "Why Change" + Neuroscience of Attention
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-parents-junior',
    name: 'Parent Onboarding — Junior Players',
    methodology: 'Corporate Visions + Neuroscience of Attention',
    target_persona: 'parent',
    description: 'Educate tennis parents on how AI analysis accelerates junior development. Builds trust through data and social proof.',
    is_active: true,
    emails: [
      {
        sequence_num: 1, delay_days: 0, email_type: 'intro',
        subject: 'The #1 thing holding your junior player back (it\'s not practice hours)',
        body_html: '<p>Hi {{first_name}},</p><p>Most tennis parents assume more practice = faster improvement. The data tells a different story.</p><p><strong>Junior players who get specific, biomechanical feedback improve 2.8x faster than those who just hit more balls.</strong></p><p>Why? Because without feedback, practice reinforces bad habits. Every hour on court without correction is an hour building muscle memory around the wrong mechanics.</p><p>SmartSwing AI gives your child the same biomechanical analysis that tour pros get — from a phone camera.</p><p>Curious how it works? <a href="https://smartswingai.com/for-parents.html">See a sample junior report →</a></p>',
        body_text: 'Most parents think more practice = faster improvement. Data says otherwise. Juniors with biomechanical feedback improve 2.8x faster. SmartSwing gives your child tour-pro level analysis from a phone camera.'
      },
      {
        sequence_num: 2, delay_days: 2, email_type: 'social_proof',
        subject: '"My son moved up 2 levels in one season" — here\'s what happened',
        body_html: '<p>{{first_name}},</p><p>Meet the Rodriguez family. Their son Marcus was stuck at 3.0 NTRP for 18 months. Private lessons weren\'t moving the needle.</p><p>After 8 weeks with SmartSwing, his coach identified a <strong>hip rotation timing issue</strong> that was invisible to the naked eye. Two weeks of targeted drills later, his forehand power jumped 31%.</p><p>Marcus is now rated 3.5 and competing in sectionals.</p><p>Every junior player has hidden inefficiencies. The question is whether you find them early or let them calcify.</p><p><a href="https://smartswingai.com/for-parents.html">Start your child\'s free analysis →</a></p>',
        body_text: 'Marcus Rodriguez was stuck at 3.0 for 18 months. SmartSwing found a hip rotation timing issue invisible to the eye. 8 weeks later: 3.5 NTRP, competing in sectionals. Every junior has hidden inefficiencies.'
      },
      {
        sequence_num: 3, delay_days: 4, email_type: 'value',
        subject: 'What your child\'s coach can\'t see (but AI can)',
        body_html: '<p>{{first_name}},</p><p>Even the best coaches miss things. Here\'s why:</p><ul><li>The human eye processes at ~30fps — a tennis swing takes 0.3 seconds</li><li>Coaches watch from one angle — biomechanics happen in 3D</li><li>Fatigue patterns emerge over 50+ swings — coaches see 5-10 in a lesson</li></ul><p>SmartSwing captures every frame, measures joint angles to 0.5° precision, and tracks trends across hundreds of swings.</p><p>It doesn\'t replace your child\'s coach. It gives their coach superpowers.</p>',
        body_text: 'Even great coaches miss things. Human eye: 30fps. Tennis swing: 0.3 seconds. SmartSwing captures every frame, measures to 0.5° precision, tracks patterns across hundreds of swings. It gives coaches superpowers.'
      },
      {
        sequence_num: 4, delay_days: 7, email_type: 'urgency',
        subject: 'Tournament season is coming — is your junior ready?',
        body_html: '<p>{{first_name}},</p><p>Spring tournament season starts in {{weeks_until}} weeks. Players who start biomechanical training now will have 6-8 weeks of data-driven improvement before their first match.</p><p>That\'s the difference between going in with the same game and going in with a measurably better one.</p><p><strong>Start free today</strong> — upload one swing video, get your child\'s first AI analysis report in under 5 minutes.</p><p><a href="https://smartswingai.com/analyze.html">Upload first swing →</a></p>',
        body_text: 'Tournament season in {{weeks_until}} weeks. Start biomechanical training now = 6-8 weeks of data-driven improvement. Upload one swing, get first AI report in under 5 minutes.'
      },
      {
        sequence_num: 5, delay_days: 10, email_type: 'cta',
        subject: 'Free analysis report for {{child_name}} — no credit card needed',
        body_html: '<p>{{first_name}},</p><p>We\'d love to show you what SmartSwing can do for {{child_name}}\'s game.</p><p>Upload any swing video and get a full biomechanical breakdown — <strong>completely free, no credit card, no commitment.</strong></p><p>If the report is useful, you\'ll know. If not, you\'ve lost nothing but 5 minutes.</p><p><a href="https://smartswingai.com/analyze.html">Get free analysis →</a></p><p>Good luck on the courts! 🎾</p>',
        body_text: 'Upload any swing video, get a full biomechanical breakdown — free, no credit card, no commitment. 5 minutes is all it takes.'
      }
    ],
    sms: [
      { sequence_num: 1, delay_days: 5, message: '{{first_name}}, tournament season is coming! Get {{child_name}}\'s free AI swing analysis: https://smartswingai.com/analyze.html — reply STOP to opt out' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 7: Coach Partnership — Advanced Outreach
  // Methodology: Mirroring + Neuroscience of Attention + SPIN
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-coach-partnership',
    name: 'Coach Partnership — Advanced',
    methodology: 'Mirroring + Neuroscience of Attention + SPIN',
    target_persona: 'coach',
    description: 'Deep-dive outreach for certified coaches. Positions SmartSwing as revenue multiplier and retention tool.',
    is_active: true,
    emails: [
      {
        sequence_num: 1, delay_days: 0, email_type: 'intro',
        subject: 'How 3 coaches added $2,400/month with zero extra court time',
        body_html: '<p>Hi Coach {{first_name}},</p><p>Three coaches in our early access program found a way to serve more students without adding hours.</p><p>They use SmartSwing AI to provide <strong>between-lesson analysis</strong>. Students upload practice videos, get AI biomechanical reports, and the coach reviews them remotely in 2 minutes per student.</p><p>Result: each coach added 8-12 remote analysis clients at $200-300/month. That\'s $2,400/month in new revenue with ~30 minutes of daily review time.</p><p>Interested in how this could work for your practice?</p>',
        body_text: '3 coaches added $2,400/month in revenue with zero extra court time. They use SmartSwing for between-lesson analysis — students upload videos, AI analyzes, coach reviews in 2 min. 8-12 remote clients at $200-300/month each.'
      },
      {
        sequence_num: 2, delay_days: 2, email_type: 'value',
        subject: 'The "remote analysis" model — step by step',
        body_html: '<p>Coach {{first_name}},</p><p>Here\'s exactly how the remote analysis model works:</p><ol><li><strong>Student records</strong> — phone on a tripod, 3-5 rallies</li><li><strong>SmartSwing analyzes</strong> — full biomechanical report in 60 seconds</li><li><strong>You review</strong> — annotate, add coaching notes (2 min per student)</li><li><strong>Student gets report</strong> — with your personalized guidance layered on AI data</li></ol><p>You\'re not replaced. You\'re amplified. The AI handles measurement, you handle coaching intelligence.</p><p>Most coaches charge $50-75 per remote review. At 8 students × 4 reviews/month = $1,600-2,400/month.</p>',
        body_text: 'The remote analysis model: Student records → SmartSwing analyzes (60 sec) → You review + annotate (2 min) → Student gets AI report + your coaching notes. $50-75 per review. 8 students × 4/month = $1,600-2,400.'
      },
      {
        sequence_num: 3, delay_days: 4, email_type: 'social_proof',
        subject: '"My students actually do their homework now" — Coach Maria',
        body_html: '<p>{{first_name}},</p><p>Coach Maria Gonzalez had a problem every coach knows: students forget everything between lessons.</p><p>After integrating SmartSwing, her students practice with purpose. They upload videos, check their AI reports, and come to the next lesson <strong>already knowing what to work on</strong>.</p><p>"Lesson quality went through the roof because we skip the diagnostic phase and go straight to improvement," Maria says.</p><p>Her student retention? Up 40% since she started.</p>',
        body_text: 'Coach Maria\'s students now practice with purpose — they upload videos, check AI reports, and come to lessons already knowing what to work on. Her retention: up 40%.'
      },
      {
        sequence_num: 4, delay_days: 7, email_type: 'urgency',
        subject: 'We\'re onboarding 10 coaches this quarter — 4 spots left',
        body_html: '<p>Coach {{first_name}},</p><p>We\'re limiting our coach partnership program to 10 new coaches this quarter so we can provide hands-on onboarding and support.</p><p><strong>4 spots remain.</strong></p><p>What you get:</p><ul><li>Free Pro account for the quarter</li><li>Branded reports with your logo and contact info</li><li>Dedicated coach dashboard to track all students</li><li>1-on-1 onboarding call to set up your workflow</li></ul><p><a href="https://smartswingai.com/for-coaches.html">Apply for coach partnership →</a></p>',
        body_text: '4 spots left in our coach partnership: free Pro account, branded reports, coach dashboard, 1-on-1 onboarding. Apply: https://smartswingai.com/for-coaches.html'
      },
      {
        sequence_num: 5, delay_days: 10, email_type: 'final',
        subject: 'Quick question about your coaching practice',
        body_html: '<p>Coach {{first_name}},</p><p>I\'ve sent a few emails about how coaches are using SmartSwing AI. Before I stop, one honest question:</p><p><em>What\'s the biggest bottleneck in your coaching practice right now?</em></p><p>If it\'s time, student retention, between-lesson engagement, or scaling beyond court hours — SmartSwing was built for exactly that.</p><p>If it\'s something else entirely, I\'d genuinely love to hear. Reply to this email and let me know.</p><p>Either way, best of luck this season. 🎾</p>',
        body_text: 'One question before I stop: what\'s the biggest bottleneck in your coaching practice? If it\'s time, retention, or scaling — SmartSwing was built for that. Reply and let me know.'
      }
    ],
    sms: [
      { sequence_num: 1, delay_days: 5, message: 'Coach {{first_name}}, 4 spots left in our partnership program — free Pro account + branded reports. Details: https://smartswingai.com/for-coaches.html — reply STOP to opt out' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 9: Newsletter Subscriber — Nurture
  // Methodology: Neuroscience of Attention + Positive Selling + Virality
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-newsletter-nurture',
    name: 'Newsletter Subscriber — Nurture',
    methodology: 'Neuroscience of Attention + Positive Selling + Virality',
    target_persona: 'player',
    description: 'Warm nurture sequence for newsletter subscribers who haven\'t signed up. Uses curiosity gaps and progressive disclosure.',
    is_active: true,
    emails: [
      {
        sequence_num: 1, delay_days: 0, email_type: 'intro',
        subject: 'Welcome — here\'s the swing mistake 91% of club players make',
        body_html: '<p>Hi {{first_name}},</p><p>Welcome to the SmartSwing newsletter.</p><p>Since you\'re here, let\'s start with something useful: <strong>91% of club players have the same forehand timing error.</strong></p><p>It\'s a 40-millisecond lag between hip rotation and arm acceleration. Too small to see. Big enough to cost you 15-20% of your power.</p><p>In our next email, I\'ll show you exactly how to test if you have it — and what to do about it.</p><p>Talk soon,<br>The SmartSwing Team</p>',
        body_text: 'Welcome. 91% of club players have the same forehand timing error: a 40ms lag between hip rotation and arm acceleration. Too small to see, costs 15-20% power. Next email: how to test if you have it.'
      },
      {
        sequence_num: 2, delay_days: 2, email_type: 'value',
        subject: 'The 40ms test — do you have the timing gap?',
        body_html: '<p>{{first_name}},</p><p>Here\'s how to check for the 40ms timing gap:</p><ol><li>Record yourself hitting 10 forehands (phone on a fence works fine)</li><li>Watch in slow motion — look at where your hips are when your arm starts forward</li><li>If your hips have already opened past 45° before your arm moves, you have it</li></ol><p>Or… upload the video to SmartSwing and we\'ll measure it to the millisecond.</p><p><a href="https://smartswingai.com/analyze.html">Try free analysis →</a></p><p>Either way, now you know what to look for.</p>',
        body_text: 'The 40ms test: Record 10 forehands. Watch slow-mo. If hips open past 45° before arm moves forward = you have the timing gap. Or upload to SmartSwing for millisecond-precision measurement.'
      },
      {
        sequence_num: 3, delay_days: 5, email_type: 'social_proof',
        subject: 'Readers are sharing: "I never knew my serve was doing this"',
        body_html: '<p>{{first_name}},</p><p>We\'ve been getting replies from newsletter readers who tried the free analysis. A few highlights:</p><ul><li>"I never knew my serve toss was 4 inches too far left. Fixed it, gained 8mph." — Jason T.</li><li>"The backhand report showed I was dropping my elbow on every single shot. 20 years of this." — Karen M.</li><li>"Showed my coach the report. Even he was surprised by the data." — Michael R.</li></ul><p>The common thread? Every one of them discovered something they couldn\'t see on their own.</p>',
        body_text: 'Readers are discovering things they never knew: misplaced tosses, dropped elbows, inefficient paths. Every one found something invisible to the naked eye.'
      },
      {
        sequence_num: 4, delay_days: 7, email_type: 'viral',
        subject: 'Share this with your tennis group chat',
        body_html: '<p>{{first_name}},</p><p>Here\'s a challenge for your tennis group:</p><p><strong>Everyone uploads one serve video. Compare your biomechanical scores. Lowest score buys drinks after the next match.</strong></p><p>It takes 2 minutes per person, and the debates about technique will be legendary.</p><p>Forward this email or share: <a href="https://smartswingai.com/analyze.html">smartswingai.com/analyze</a></p><p>We\'ve seen this spread through entire clubs. Data + competition = addictive.</p>',
        body_text: 'Challenge: everyone in your group uploads one serve video. Compare biomechanical scores. Lowest score buys drinks. Share: https://smartswingai.com/analyze.html'
      },
      {
        sequence_num: 5, delay_days: 10, email_type: 'cta',
        subject: 'Your free swing analysis — still waiting for you',
        body_html: '<p>{{first_name}},</p><p>Just a reminder: you have a free swing analysis available anytime.</p><p>No credit card. No commitment. Just upload a video and see what the AI finds.</p><p>Most people are surprised by at least one thing in their report. The question is: are you curious enough to find out?</p><p><a href="https://smartswingai.com/analyze.html">Get your free analysis →</a></p>',
        body_text: 'Reminder: free swing analysis available. No credit card. Upload a video, see what the AI finds. Most people are surprised by at least one thing.'
      }
    ],
    sms: []
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CADENCE 10: Influencer / Ambassador Outreach
  // Methodology: Corporate Visions + Positive Selling + FOMO
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'cadence-influencer-outreach',
    name: 'Influencer / Ambassador Outreach',
    methodology: 'Corporate Visions + Positive Selling + FOMO',
    target_persona: 'coach',
    description: 'Recruit tennis influencers and content creators as SmartSwing ambassadors. Revenue share + exclusive access.',
    is_active: true,
    emails: [
      {
        sequence_num: 1, delay_days: 0, email_type: 'intro',
        subject: 'Partnership opportunity — AI tennis content your audience will love',
        body_html: '<p>Hi {{first_name}},</p><p>I follow your content on {{platform}} — your {{content_topic}} posts consistently get great engagement.</p><p>I\'m reaching out because SmartSwing AI is building an ambassador program for tennis creators, and your audience is exactly who benefits from this.</p><p><strong>The pitch:</strong> You get free lifetime Pro access + 30% revenue share on every subscriber you refer. We provide content ideas, data, and co-branded assets.</p><p>Interested in hearing more? Quick reply is all it takes.</p>',
        body_text: 'I follow your content — great engagement. SmartSwing is building an ambassador program: free lifetime Pro + 30% revenue share on referrals. We provide content ideas + assets. Interested?'
      },
      {
        sequence_num: 2, delay_days: 3, email_type: 'value',
        subject: 'What SmartSwing ambassadors get (full breakdown)',
        body_html: '<p>{{first_name}},</p><p>Here\'s the full ambassador package:</p><ul><li><strong>Free lifetime Pro account</strong> — full access, no limits</li><li><strong>30% recurring commission</strong> — on every subscriber you refer, for as long as they stay</li><li><strong>Co-branded content</strong> — we create graphics, video hooks, and scripts for you</li><li><strong>Early access</strong> — test new features before anyone else</li><li><strong>Exclusive data</strong> — use our analysis stats in your content (with attribution)</li><li><strong>Dedicated Slack channel</strong> — direct access to our product team</li></ul><p>Our top ambassador generated $1,800 in commissions last month from 3 posts.</p>',
        body_text: 'Ambassador package: Free lifetime Pro, 30% recurring commission, co-branded content, early access, exclusive data, direct Slack access. Top ambassador: $1,800/month from 3 posts.'
      },
      {
        sequence_num: 3, delay_days: 5, email_type: 'social_proof',
        subject: 'How @TennisTechReview got 12k views with one SmartSwing post',
        body_html: '<p>{{first_name}},</p><p>Last month, @TennisTechReview posted a side-by-side of their swing analysis vs. a tour pro\'s. <strong>12,400 views and 340 comments in 48 hours.</strong></p><p>Why? Because data-driven tennis content is rare, genuinely useful, and inherently shareable. People tag their partners, debate technique, and try it themselves.</p><p>Every ambassador reports the same thing: SmartSwing content gets 2-5x their normal engagement.</p><p>Your audience would eat this up.</p>',
        body_text: '@TennisTechReview got 12.4k views from one SmartSwing post. Data-driven tennis content is rare, useful, and shareable. Ambassadors report 2-5x normal engagement.'
      },
      {
        sequence_num: 4, delay_days: 7, email_type: 'urgency',
        subject: 'We\'re capping ambassadors at 25 — 7 spots open',
        body_html: '<p>{{first_name}},</p><p>Quick update: we\'re limiting the ambassador program to 25 creators to keep it exclusive and high-value.</p><p><strong>7 spots remain.</strong></p><p>Once we hit 25, we\'re closing applications until Q3.</p><p>If this is something you\'d consider, reply to this email and I\'ll send over the agreement. No pressure, no commitment until you sign.</p>',
        body_text: '7 of 25 ambassador spots remain. Closing applications when full. Reply for the agreement — no commitment until you sign.'
      },
      {
        sequence_num: 5, delay_days: 10, email_type: 'final',
        subject: 'Last note — door\'s open whenever you\'re ready',
        body_html: '<p>{{first_name}},</p><p>This is my last email about the ambassador program. I don\'t want to be that brand that won\'t stop emailing.</p><p>If the timing isn\'t right, no problem. The link below will stay active, and you can apply whenever:</p><p><a href="https://smartswingai.com/contact.html">Ambassador application →</a></p><p>Keep creating great content. Your audience is lucky to have you.</p><p>— SmartSwing Team</p>',
        body_text: 'Last email. If timing isn\'t right, no problem. Apply whenever: https://smartswingai.com/contact.html. Keep creating great content.'
      }
    ],
    sms: [
      { sequence_num: 1, delay_days: 4, message: '{{first_name}}, 7 ambassador spots left — free Pro + 30% commission. Details: https://smartswingai.com/contact.html — reply STOP to opt out' }
    ]
  }

];
