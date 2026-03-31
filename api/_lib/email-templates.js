/**
 * SmartSwing AI — Transactional Email Templates
 * All templates return { subject, html } for Resend.
 * Inline CSS only — email clients strip <style> blocks.
 */

const APP_URL = process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com';

// ─── Shared design tokens ───────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a',
  panel: '#16161a',
  border: '#2a2a30',
  text: '#f5f7fa',
  muted: '#9aa5b4',
  volt: '#39ff14',
  gold: '#ffd84d',
  teal: '#00d4aa',
  red: '#ff5252',
  white: '#ffffff'
};

function base({ preheader = '', body = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartSwing AI</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${C.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${C.bg};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" style="max-width:560px;" cellspacing="0" cellpadding="0" border="0">

        <!-- Logo / brand -->
        <tr>
          <td style="padding:0 0 24px 0;text-align:left;">
            <a href="${APP_URL}" style="text-decoration:none;font-size:20px;font-weight:800;color:${C.text};letter-spacing:-0.3px;">
              SmartSwing<span style="color:${C.volt};">.</span>AI
            </a>
          </td>
        </tr>

        <!-- Body card -->
        <tr>
          <td style="background-color:${C.panel};border:1px solid ${C.border};border-radius:20px;padding:36px 32px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0 0;text-align:center;font-size:12px;color:${C.muted};line-height:1.7;">
            SmartSwing AI &bull; AI-Powered Tennis &amp; Pickleball Coaching<br>
            <a href="${APP_URL}/privacy-policy.html" style="color:${C.muted};text-decoration:underline;">Privacy Policy</a> &nbsp;&bull;&nbsp;
            <a href="${APP_URL}/user-agreement.html" style="color:${C.muted};text-decoration:underline;">Terms</a> &nbsp;&bull;&nbsp;
            <a href="${APP_URL}/settings.html" style="color:${C.muted};text-decoration:underline;">Manage preferences</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function btn(label, url, opts = {}) {
  const bg = opts.variant === 'secondary' ? 'transparent' : C.volt;
  const color = opts.variant === 'secondary' ? C.text : '#0a0a0a';
  const border = opts.variant === 'secondary' ? `border:1px solid ${C.border};` : '';
  return `<a href="${url}" style="display:inline-block;background-color:${bg};color:${color};font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:12px;${border}mso-padding-alt:0;text-align:center;">${label}</a>`;
}

function divider() {
  return `<tr><td style="padding:24px 0;"><div style="border-top:1px solid ${C.border};"></div></td></tr>`;
}

function statBlock(items = []) {
  const cells = items.map(({ value, label }) =>
    `<td style="text-align:center;padding:0 16px;">
      <div style="font-size:28px;font-weight:800;color:${C.volt};letter-spacing:-1px;">${value}</div>
      <div style="font-size:12px;color:${C.muted};margin-top:4px;">${label}</div>
    </td>`
  ).join('<td style="width:1px;background:' + C.border + ';"></td>');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;"><tr>${cells}</tr></table>`;
}

// ─── Template: welcome ───────────────────────────────────────────────────────
function welcome({ firstName = 'there', email = '' } = {}) {
  return {
    subject: 'Welcome to SmartSwing AI — your 2 free analyses are waiting',
    html: base({
      preheader: 'Record a swing, get instant AI biomechanics feedback. No coach required.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">Welcome aboard</p>
        <h1 style="font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">Your AI swing coach is ready, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          You've just unlocked <strong style="color:${C.text};">2 free AI swing analyses</strong> — no credit card needed. Record a forehand, backhand, serve, or any shot and get instant biomechanics feedback on exactly what needs fixing.
        </p>

        ${statBlock([
          { value: '2', label: 'Free analyses' },
          { value: '14', label: 'Metrics tracked' },
          { value: '<60s', label: 'To your first insight' }
        ])}

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px 0;">
          <tr><td>${btn('Analyse My First Swing →', APP_URL + '/analyze.html')}</td></tr>
        </table>

        <p style="font-size:14px;font-weight:700;color:${C.text};margin:0 0 10px 0;">How to get started in 60 seconds:</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${[
            ['1', 'Record a 5–10 second clip of your swing on your phone'],
            ['2', 'Upload it on the Analyse page (no app download needed)'],
            ['3', 'Get your AI report with drills to fix your weakest shot']
          ].map(([n, text]) => `
          <tr>
            <td style="padding:0 0 10px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="width:28px;height:28px;border-radius:50%;background-color:rgba(57,255,20,0.12);text-align:center;vertical-align:middle;">
                    <span style="font-size:13px;font-weight:800;color:${C.volt};">${n}</span>
                  </td>
                  <td style="padding-left:12px;font-size:14px;color:${C.muted};line-height:1.5;">${text}</td>
                </tr>
              </table>
            </td>
          </tr>`).join('')}
        </table>

        <p style="font-size:13px;color:${C.muted};margin:20px 0 0 0;line-height:1.6;">
          Questions? Reply to this email — we read every one.<br>
          Signed in as <span style="color:${C.text};">${email}</span>
        </p>
      `
    })
  };
}

// ─── Template: analysis_warning (1 of 2 used) ────────────────────────────────
function analysisWarning({ firstName = 'there' } = {}) {
  return {
    subject: 'You have 1 free analysis left — make it count',
    html: base({
      preheader: 'You\'ve used your first free analysis. One remains — then choose a plan to keep going.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.gold};margin:0 0 12px 0;">Heads up</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">1 free analysis remaining, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          You just completed your first AI swing analysis — great work. You have <strong style="color:${C.text};">1 free analysis left</strong>. After that, a plan is needed to keep your coaching momentum going.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td style="padding:0 0 12px 0;">${btn('Use My Last Free Analysis', APP_URL + '/analyze.html')}</td></tr>
          <tr><td>${btn('See All Plans', APP_URL + '/pricing.html', { variant: 'secondary' })}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};margin:20px 0 0 0;line-height:1.6;">
          Plans start at <strong style="color:${C.text};">$9.99/mo</strong> — less than a single private lesson.
          Cancel anytime.
        </p>
      `
    })
  };
}

// ─── Template: paywall_hit (both free analyses used) ─────────────────────────
function paywallHit({ firstName = 'there' } = {}) {
  return {
    subject: 'Your 2 free analyses are used — keep your momentum going',
    html: base({
      preheader: 'Don\'t let your improvement stall. Plans start at $9.99/mo — less than a single lesson.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};margin:0 0 12px 0;">You're on a roll</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">You've used both free analyses, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 20px 0;">
          The good news: you've already proven you can improve. The AI has identified your patterns. Now's the time to act on them — before the muscle memory of your old technique sets back in.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:rgba(57,255,20,0.06);border:1px solid rgba(57,255,20,0.18);border-radius:14px;">
          ${[
            ['Player', '$9.99/mo', '10 analyses/month + drill library'],
            ['Performance', '$19.99/mo', 'Unlimited analyses + coach tools'],
          ].map(([name, price, desc]) => `
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid ${C.border};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:15px;font-weight:700;color:${C.text};">${name}</div>
                    <div style="font-size:13px;color:${C.muted};margin-top:2px;">${desc}</div>
                  </td>
                  <td style="text-align:right;white-space:nowrap;">
                    <span style="font-size:16px;font-weight:800;color:${C.volt};">${price}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`).join('')}
          <tr><td style="padding:14px 18px;"><span style="font-size:13px;color:${C.muted};">30-day money-back guarantee &bull; Cancel anytime</span></td></tr>
        </table>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn('Choose My Plan →', APP_URL + '/pricing.html')}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:16px 0 0 0;">
          Use coupon code <strong style="color:${C.text};background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-family:monospace;">SWINGAI</strong> for 1 month free on the Performance plan.
        </p>
      `
    })
  };
}

// ─── Template: payment_success ───────────────────────────────────────────────
function paymentSuccess({ firstName = 'there', planName = 'Player', billingInterval = 'monthly' } = {}) {
  const isDrillAccess = ['performance', 'pro', 'elite', 'coach'].includes(planName.toLowerCase());
  return {
    subject: `You're on SmartSwing ${planName} — let's build your game`,
    html: base({
      preheader: `Your ${planName} plan is active. Unlimited AI analysis starts now.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">Plan activated</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">Welcome to ${planName}, ${firstName}. 🎾</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          Your <strong style="color:${C.text};">SmartSwing ${planName}</strong> plan is now active${billingInterval === 'yearly' ? ' for the next 12 months' : ''}. Every swing you record from here is tracked, measured, and turned into a personalised drill plan.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
          ${[
            ['Start your first paid analysis', APP_URL + '/analyze.html', C.volt],
            ['View your progress dashboard', APP_URL + '/dashboard.html', C.border],
            ...(isDrillAccess ? [['Browse your drill library', APP_URL + '/library.html', C.border]] : [])
          ].map(([label, url, bg], i) => `
          <tr>
            <td style="padding:0 0 ${i < 2 ? '10' : '0'}px 0;">
              <a href="${url}" style="display:block;background-color:${bg === C.volt ? C.volt : 'rgba(255,255,255,0.04)'};color:${bg === C.volt ? '#0a0a0a' : C.text};font-size:14px;font-weight:700;text-decoration:none;padding:13px 18px;border-radius:12px;${bg !== C.volt ? 'border:1px solid ' + C.border + ';' : ''}">
                ${label} →
              </a>
            </td>
          </tr>`).join('')}
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          Manage billing at any time in <a href="${APP_URL}/settings.html" style="color:${C.text};">Settings → Billing</a>.<br>
          Questions? Reply to this email — we respond within 1 business day.
        </p>
      `
    })
  };
}

// ─── Template: win_back_7d ───────────────────────────────────────────────────
function winBack7d({ firstName = 'there' } = {}) {
  return {
    subject: `${firstName}, your swing analysis is still waiting`,
    html: base({
      preheader: 'You signed up but haven\'t recorded a swing yet. It takes 60 seconds.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.muted};margin:0 0 12px 0;">A quick check-in</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">Your free analyses are still here, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          You created your SmartSwing account a week ago but haven't recorded a swing yet. Your 2 free analyses are still waiting — and they don't expire.
        </p>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          All you need is a 5-second video of any shot. The AI will break down your biomechanics and give you the exact drills to fix your weakest link.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn('Analyse My Swing Now', APP_URL + '/analyze.html')}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:16px 0 0 0;">
          Takes 60 seconds. No app download. Just a phone and a swing.
        </p>
      `
    })
  };
}

// ─── Template: win_back_21d ──────────────────────────────────────────────────
function winBack21d({ firstName = 'there' } = {}) {
  return {
    subject: 'Still thinking? Here\'s 20% off your first month',
    html: base({
      preheader: 'Use code SWING20 for 20% off any paid plan. Valid for 7 days.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.gold};margin:0 0 12px 0;">Special offer</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">20% off to get you started, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 20px 0;">
          You've been on SmartSwing for three weeks but haven't run your first analysis yet. We want to remove every barrier — so here's a discount to get you moving.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:rgba(255,216,77,0.06);border:1px solid rgba(255,216,77,0.22);border-radius:14px;padding:20px;">
          <tr>
            <td style="text-align:center;">
              <div style="font-size:13px;color:${C.muted};margin-bottom:8px;">Your discount code</div>
              <div style="font-size:32px;font-weight:900;color:${C.gold};letter-spacing:2px;font-family:monospace;">SWING20</div>
              <div style="font-size:13px;color:${C.muted};margin-top:8px;">20% off your first month &bull; Valid 7 days</div>
            </td>
          </tr>
        </table>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn('Claim My 20% Discount →', APP_URL + '/pricing.html')}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          Enter <strong style="color:${C.text};font-family:monospace;">SWING20</strong> at checkout. Offer expires in 7 days.<br>
          Player plan from <strong style="color:${C.text};">$7.99/mo</strong> with this code.
        </p>
      `
    })
  };
}

// ── Template: paywall_followup_3d ────────────────────────────────────────────
function paywallFollowup3d({ firstName = 'there' } = {}) {
  return {
    subject: `${firstName}, here's exactly what you're missing on SmartSwing`,
    html: base({
      preheader: '3 days ago you ran out of free analyses. Here\'s what unlocks on the $9.99 plan.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.muted};margin:0 0 12px 0;">3 days ago</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">You hit your free analysis limit, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          Since then, your technique has had 3 days to ingrain — good or bad. Here's what you'd unlock on the <strong style="color:${C.text};">Player plan at $9.99/month</strong>:
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
          ${[
            ['10 analyses per month', 'vs 2 lifetime on Free', C.volt],
            ['Save & export reports', 'Build your improvement history', C.volt],
            ['Print coach-ready PDFs', 'Share with your instructor', C.volt],
            ['Progress timeline', 'See your SmartSwing Score over time', C.volt],
          ].map(([feature, sub, color]) => `
          <tr>
            <td style="padding:12px 16px;border-bottom:1px solid ${C.border};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
                <td style="width:20px;padding-right:10px;vertical-align:top;">
                  <span style="color:${color};font-size:14px;font-weight:800;">✓</span>
                </td>
                <td>
                  <div style="font-size:14px;font-weight:700;color:${C.text};">${feature}</div>
                  <div style="font-size:12px;color:${C.muted};margin-top:2px;">${sub}</div>
                </td>
              </tr></table>
            </td>
          </tr>`).join('')}
          <tr><td style="padding:12px 16px;"><span style="font-size:13px;color:${C.muted};">Cancel anytime · 30-day money-back guarantee</span></td></tr>
        </table>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn('Unlock Player Plan — $9.99/mo →', APP_URL + '/pricing.html')}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          Or refer a friend and get <strong style="color:${C.text};">+2 free analyses</strong> — no credit card needed.<br>
          <a href="${APP_URL}/refer-friends.html" style="color:${C.volt};text-decoration:none;font-weight:700;">Get your referral link →</a>
        </p>
      `
    })
  };
}

// ── Template: paywall_followup_7d ────────────────────────────────────────────
function paywallFollowup7d({ firstName = 'there' } = {}) {
  return {
    subject: 'Last chance: 20% off SmartSwing for the next 48 hours',
    html: base({
      preheader: 'A week without AI feedback. Your technique habits are setting in. Here\'s 20% off to fix that.',
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.gold};margin:0 0 12px 0;">One week later</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">A week without feedback, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 20px 0;">
          Research shows that without corrective feedback, players reinforce existing mechanics — both good and bad — after just 4–6 practice sessions. You've likely had several since your last analysis.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:rgba(255,216,77,0.06);border:1px solid rgba(255,216,77,0.22);border-radius:14px;padding:20px;">
          <tr>
            <td style="text-align:center;">
              <div style="font-size:13px;color:${C.muted};margin-bottom:8px;">Your 48-hour discount</div>
              <div style="font-size:36px;font-weight:900;color:${C.gold};letter-spacing:2px;font-family:monospace;">SWING20</div>
              <div style="font-size:13px;color:${C.muted};margin-top:8px;">20% off your first month · Any plan · Expires in 48 hours</div>
            </td>
          </tr>
        </table>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn('Use SWING20 — Get 20% Off →', APP_URL + '/pricing.html')}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          Player plan from <strong style="color:${C.text};">$7.99/mo</strong> with this code.<br>
          Or <a href="${APP_URL}/refer-friends.html" style="color:${C.volt};text-decoration:none;font-weight:700;">refer a friend</a> for 2 more free analyses instead.
        </p>
      `
    })
  };
}

// ── Template: referral_bonus (notify referrer when friend completes first analysis) ──
function referralBonus({ firstName = 'there', bonusCount = 2 } = {}) {
  return {
    subject: `+${bonusCount} free analyses added — your referral worked!`,
    html: base({
      preheader: `A friend you referred just completed their first analysis. You've earned ${bonusCount} more free analyses.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">Referral bonus</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">+${bonusCount} analyses added, ${firstName}! 🎾</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          A friend you referred just completed their first SmartSwing analysis. As a thank you, we've added <strong style="color:${C.text};">${bonusCount} more free analyses</strong> to your account — no credit card needed.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn('Use My Bonus Analyses →', APP_URL + '/analyze.html')}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          Keep referring — each friend who completes their first analysis earns you <strong style="color:${C.text};">+2 more analyses</strong>.<br>
          <a href="${APP_URL}/refer-friends.html" style="color:${C.volt};text-decoration:none;font-weight:700;">Share your referral link →</a>
        </p>
      `
    })
  };
}

// ── Template: coach_report_share ─────────────────────────────────────────────
function coachReportShare({
  playerName = 'Your player',
  coachEmail = '',
  shotType = 'swing',
  score = 0,
  grade = '',
  shareUrl = '',
  topDrills = []
} = {}) {
  const gradeColor = grade === 'A' || grade === 'A+' ? C.volt
    : grade && grade[0] === 'B' ? C.teal
    : grade && grade[0] === 'C' ? C.gold
    : C.muted;

  const drillRows = topDrills.slice(0, 3).map(([title, focus]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${C.border};">
        <div style="font-size:14px;font-weight:700;color:${C.text};">${title}</div>
        ${focus ? `<div style="font-size:12px;color:${C.muted};margin-top:3px;line-height:1.5;">${focus}</div>` : ''}
      </td>
    </tr>`).join('');

  return {
    subject: `${playerName}'s SmartSwing AI Biomechanics Report — ${shotType}`,
    html: base({
      preheader: `${playerName} scored ${score}/100 on their ${shotType} analysis. View the full AI breakdown.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">Swing Analysis Report</p>
        <h1 style="font-size:24px;font-weight:800;line-height:1.1;letter-spacing:-.5px;color:${C.text};margin:0 0 6px 0;">${playerName}'s ${shotType} Analysis</h1>
        <p style="font-size:14px;color:${C.muted};margin:0 0 24px 0;">Your player just completed an AI biomechanics analysis on SmartSwing AI.</p>

        <!-- Score + grade -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:rgba(57,255,20,.05);border:1px solid rgba(57,255,20,.18);border-radius:16px;padding:20px;">
          <tr>
            <td style="text-align:center;">
              <div style="font-size:54px;font-weight:900;letter-spacing:-3px;line-height:1;color:${C.volt};">${score}</div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${C.muted};margin-top:4px;">SmartSwing Score</div>
              ${grade ? `<div style="display:inline-block;margin-top:10px;padding:5px 18px;border-radius:999px;background:rgba(57,255,20,.12);border:1px solid rgba(57,255,20,.28);color:${gradeColor};font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Grade: ${grade}</div>` : ''}
            </td>
          </tr>
        </table>

        ${drillRows ? `
        <p style="font-size:13px;font-weight:700;color:${C.text};margin:0 0 10px 0;text-transform:uppercase;letter-spacing:.06em;">AI-Recommended Drills</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
          ${drillRows}
        </table>` : ''}

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">
          <tr><td>${btn('View Full Report →', shareUrl)}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          This report was shared by ${playerName} via SmartSwing AI.<br>
          Not a SmartSwing coach yet? <a href="${APP_URL}/pricing.html" style="color:${C.volt};text-decoration:none;font-weight:700;">Try it free →</a>
        </p>
      `
    })
  };
}

// ── Template: monthly_digest ─────────────────────────────────────────────────
function monthlyDigest({
  firstName = 'there',
  analysisCount = 0,
  topImprovement = '',
  currentGrade = '',
  dashboardUrl = ''
} = {}) {
  const destination = dashboardUrl || `${APP_URL}/dashboard.html`;
  const statItems = [
    { value: String(analysisCount), label: 'Analyses this month' },
    ...(currentGrade ? [{ value: currentGrade, label: 'Current grade' }] : [])
  ];

  return {
    subject: `Your SmartSwing AI monthly recap, ${firstName}`,
    html: base({
      preheader: `${analysisCount} analyses this month. Here's what changed in your game.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};margin:0 0 12px 0;">Monthly recap</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">Here's how your game moved in ${analysisCount ? analysisCount + ' analyses' : 'the last month'}, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          Your monthly SmartSwing AI summary is in. Here's everything that shifted in your swing this month — the wins, the work in progress, and what to focus on next.
        </p>

        ${statBlock(statItems)}

        ${topImprovement ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:rgba(0,212,170,0.06);border:1px solid rgba(0,212,170,0.22);border-radius:14px;padding:18px 20px;">
          <tr>
            <td>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${C.teal};margin-bottom:8px;">Biggest improvement this month</div>
              <div style="font-size:16px;font-weight:700;color:${C.text};line-height:1.5;">${topImprovement}</div>
            </td>
          </tr>
        </table>` : ''}

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;">
          <tr><td>${btn('View Full Progress →', destination)}</td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 0 0;">
          <tr><td>${btn('Run Another Analysis', `${APP_URL}/analyze.html`, { variant: 'secondary' })}</td></tr>
        </table>
      `
    })
  };
}

// ── Template: milestone_reached ───────────────────────────────────────────────
function milestoneReached({
  firstName = 'there',
  milestone = 10,
  score = 0,
  grade = ''
} = {}) {
  const statItems = [
    { value: String(milestone), label: 'Analyses completed' },
    ...(score ? [{ value: String(score), label: 'SmartSwing Score' }] : []),
    ...(grade ? [{ value: grade, label: 'Current grade' }] : [])
  ];

  return {
    subject: `${firstName}, you've hit ${milestone} analyses on SmartSwing`,
    html: base({
      preheader: `${milestone} swings analysed. That's serious commitment.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">Milestone unlocked 🏆</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">${milestone} analyses. You're building something real, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          Most players stop at 1–2 analyses. You've done <strong style="color:${C.text};">${milestone}</strong>. That's not luck — that's the kind of consistency that actually changes how you play. Your AI feedback is compounding, and your swing data now has enough history to show real patterns.
        </p>

        ${statBlock(statItems)}

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
          <tr><td>${btn('Keep the Streak Going →', `${APP_URL}/analyze.html`)}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          Know a player who'd benefit from this kind of feedback? Each friend who completes their first analysis earns you <strong style="color:${C.text};">+2 free analyses</strong>.<br>
          <a href="${APP_URL}/refer-friends.html" style="color:${C.volt};text-decoration:none;font-weight:700;">Share your referral link →</a>
        </p>
      `
    })
  };
}

// ── Template: trial_expiring ──────────────────────────────────────────────────
function trialExpiring({
  firstName = 'there',
  daysLeft = 3,
  planName = 'Performance'
} = {}) {
  const dayWord = `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;

  return {
    subject: `${firstName}, your SmartSwing trial ends in ${dayWord}`,
    html: base({
      preheader: `${dayWord} left on ${planName}. Lock in your rate before it changes.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.gold};margin:0 0 12px 0;">Trial ending soon</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">${dayWord} left on your ${planName} trial, ${firstName}.</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 20px 0;">
          Your <strong style="color:${C.text};">${planName}</strong> trial is almost up. After it ends, you'll drop back to the free plan — which means losing access to everything you've been using to improve.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
          ${[
            ['Unlimited AI swing analyses', 'vs 2 lifetime on Free'],
            ['Full drill library', '50+ sport-specific drills'],
            ['Progress timeline & trends', 'Track your SmartSwing Score over time'],
            ['Coach-ready PDF exports', 'Share reports with your instructor'],
            ['Priority AI processing', 'Results in under 60 seconds'],
          ].map(([feature, sub], i, arr) => `
          <tr>
            <td style="padding:12px 16px;${i < arr.length - 1 ? 'border-bottom:1px solid ' + C.border + ';' : ''}">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
                <td style="width:20px;padding-right:10px;vertical-align:top;">
                  <span style="color:${C.volt};font-size:14px;font-weight:800;">✓</span>
                </td>
                <td>
                  <div style="font-size:14px;font-weight:700;color:${C.text};">${feature}</div>
                  <div style="font-size:12px;color:${C.muted};margin-top:2px;">${sub}</div>
                </td>
              </tr></table>
            </td>
          </tr>`).join('')}
        </table>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
          <tr><td>${btn(`Keep My ${planName} Plan →`, `${APP_URL}/pricing.html`)}</td></tr>
        </table>

        <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
          30-day money-back guarantee &bull; Cancel anytime &bull; No questions asked.
        </p>
      `
    })
  };
}

// ── Template: score_improved ──────────────────────────────────────────────────
function scoreImproved({
  firstName = 'there',
  shotType = 'forehand',
  previousScore = 0,
  newScore = 0,
  improvement = 0,
  grade = ''
} = {}) {
  const gradeColor = grade === 'A' || grade === 'A+' ? C.volt
    : grade && grade[0] === 'B' ? C.teal
    : grade && grade[0] === 'C' ? C.gold
    : C.muted;

  return {
    subject: `${firstName}, your ${shotType} just hit ${newScore}/100 — that's real progress`,
    html: base({
      preheader: `+${improvement} points on your ${shotType}. Your last 3 sessions are paying off.`,
      body: `
        <p style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">New personal best 🎾</p>
        <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">Your ${shotType} just improved by +${improvement} points, ${firstName}!</h1>
        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          This is what consistent analysis looks like in action. Your last few sessions have been building on each other — and the AI just confirmed it. Keep the momentum going.
        </p>

        <!-- Before / after score comparison -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background:rgba(57,255,20,0.05);border:1px solid rgba(57,255,20,0.18);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:20px 0;text-align:center;width:40%;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${C.muted};margin-bottom:8px;">Before</div>
              <div style="font-size:40px;font-weight:900;letter-spacing:-2px;color:${C.muted};line-height:1;">${previousScore}</div>
              <div style="font-size:11px;color:${C.muted};margin-top:4px;">/100</div>
            </td>
            <td style="text-align:center;width:20%;vertical-align:middle;">
              <div style="font-size:22px;font-weight:900;color:${C.volt};letter-spacing:-1px;">+${improvement}</div>
              <div style="font-size:20px;color:${C.muted};">→</div>
            </td>
            <td style="padding:20px 0;text-align:center;width:40%;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${C.volt};margin-bottom:8px;">Now</div>
              <div style="font-size:40px;font-weight:900;letter-spacing:-2px;color:${C.volt};line-height:1;">${newScore}</div>
              <div style="font-size:11px;color:${C.muted};margin-top:4px;">/100</div>
            </td>
          </tr>
          ${grade ? `
          <tr>
            <td colspan="3" style="padding:0 0 16px 0;text-align:center;">
              <span style="display:inline-block;padding:5px 18px;border-radius:999px;background:rgba(57,255,20,0.12);border:1px solid rgba(57,255,20,0.28);color:${gradeColor};font-size:14px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">Grade: ${grade}</span>
            </td>
          </tr>` : ''}
        </table>

        <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
          Progress like this compounds. Players who analyse consistently improve <strong style="color:${C.text};">3× faster</strong> than those who rely on memory alone. You're in that group now.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;">
          <tr><td>${btn('See Full Breakdown →', `${APP_URL}/dashboard.html`)}</td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 0 0;">
          <tr><td>${btn('Analyse Another Shot', `${APP_URL}/analyze.html`, { variant: 'secondary' })}</td></tr>
        </table>
      `
    })
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────
const TEMPLATES = {
  welcome,
  analysis_warning: analysisWarning,
  paywall_hit: paywallHit,
  paywall_followup_3d: paywallFollowup3d,
  paywall_followup_7d: paywallFollowup7d,
  referral_bonus: referralBonus,
  payment_success: paymentSuccess,
  win_back_7d: winBack7d,
  win_back_21d: winBack21d,
  coach_report_share: coachReportShare,
  monthly_digest: monthlyDigest,
  milestone_reached: milestoneReached,
  trial_expiring: trialExpiring,
  score_improved: scoreImproved
};

function renderTemplate(type, data = {}) {
  const fn = TEMPLATES[type];
  if (!fn) throw new Error(`Unknown email template: "${type}". Valid: ${Object.keys(TEMPLATES).join(', ')}`);
  return fn(data);
}

module.exports = { renderTemplate, TEMPLATES };
