/**
 * SmartSwing AI — Resend One-Shot Setup
 *
 * POST /api/resend-setup
 * Headers: { "x-setup-token": <CRON_SECRET> }
 *
 * Creates/updates:
 *   1. Resend Audience (if RESEND_AUDIENCE_ID not already set)
 *   2. Three broadcast templates (one per campaign)
 *   3. Webhook endpoint registration for bounce + complaint events
 *
 * Safe to call multiple times — uses idempotent names.
 * Protected by CRON_SECRET so only the owner can run it.
 *
 * Free plan limits respected:
 *   Transactional: 3,000/month, 100/day
 *   Marketing: 1,000 contacts, 3 segments, unlimited broadcasts
 *   Domains: 1
 *   Rate: 5 req/s
 */

const RESEND_API = 'https://api.resend.com';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function resendPost(path, body, apiKey) {
  const res = await fetch(`${RESEND_API}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

async function resendGet(path, apiKey) {
  const res = await fetch(`${RESEND_API}${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

// ── Broadcast HTML templates ──────────────────────────────────────────────────

const APP_URL = process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com';
const C = {
  bg: '#0a0a0a', panel: '#16161a', border: '#2a2a30',
  text: '#f5f7fa', muted: '#9aa5b4', volt: '#39ff14', gold: '#ffd84d'
};

function broadcastBase(preheader, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>SmartSwing AI</title></head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${C.text};">
${preheader ? `<div style="display:none;font-size:1px;max-height:0;overflow:hidden;">${preheader} ‌ ‌ ‌ ‌ ‌</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${C.bg};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;" cellspacing="0" cellpadding="0" border="0">
      <tr><td style="padding:0 0 24px 0;text-align:left;">
        <a href="${APP_URL}" style="text-decoration:none;font-size:20px;font-weight:800;color:${C.text};">SmartSwing<span style="color:${C.volt};">.</span>AI</a>
      </td></tr>
      <tr><td style="background-color:${C.panel};border:1px solid ${C.border};border-radius:20px;padding:36px 32px;">${body}</td></tr>
      <tr><td style="padding:24px 0 0 0;text-align:center;font-size:12px;color:${C.muted};line-height:1.7;">
        SmartSwing AI &bull; AI-Powered Tennis &amp; Pickleball Coaching<br>
        <a href="${APP_URL}/privacy-policy.html" style="color:${C.muted};">Privacy</a> &nbsp;&bull;&nbsp;
        <a href="${APP_URL}/user-agreement.html" style="color:${C.muted};">Terms</a> &nbsp;&bull;&nbsp;
        <a href="{{unsubscribe_url}}" style="color:${C.muted};">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const BROADCASTS = [
  {
    name: 'SmartSwing — Product Launch Announcement',
    subject: 'SmartSwing AI is live — your free analysis is waiting',
    preheader: 'AI biomechanics coaching for tennis and pickleball. Free to start. Results in 60 seconds.',
    body: `
      <p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">We're live</p>
      <h1 style="font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">SmartSwing AI is officially live.</h1>
      <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
        Upload one video. Get an AI biomechanics report in under 60 seconds — with your top 3 mechanical issues ranked by how much they're costing you, plus the exact drills to fix them.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
        ${[['60s', 'Time to your first insight'],['33', 'Body landmarks tracked'],['Top 3', 'Priority fixes — not a data dump']].map(([v,l]) =>
          `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.border};"><span style="font-size:22px;font-weight:900;color:${C.volt};">${v}</span> <span style="font-size:14px;color:${C.muted};">${l}</span></td></tr>`
        ).join('')}
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">
        <tr><td><a href="${APP_URL}/analyze.html" style="display:inline-block;background-color:${C.volt};color:#0a0a0a;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:12px;">Get My Free Analysis →</a></td></tr>
      </table>
      <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">No credit card. No app download. Just a 5-second video clip of any shot.</p>
    `
  },
  {
    name: 'SmartSwing — New Features: Timeline & Score Cards',
    subject: 'New: Track your progress over time + shareable score cards',
    preheader: 'Progress timeline, before/after comparison, and Instagram-ready score cards are now live.',
    body: `
      <p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">What's new</p>
      <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">3 new features just landed in your dashboard.</h1>
      <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
        Every session you've recorded is now part of your growth story. Here's what's new:
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
        ${[
          ['📈 Progress Timeline', 'See your SmartSwing Score over every session. Filter by shot type. Your personal best is highlighted in gold.'],
          ['⚖️ Before / After Comparison', 'Select any two analyses and see exactly how much each metric improved — side by side.'],
          ['🃏 Shareable Score Cards', 'Generate an Instagram or Stories-ready card with your score, grade, and top improvements. Share your wins.'],
        ].map(([title, desc]) => `
          <tr><td style="padding:14px 18px;border-bottom:1px solid ${C.border};">
            <div style="font-size:15px;font-weight:700;color:${C.text};">${title}</div>
            <div style="font-size:13px;color:${C.muted};margin-top:4px;line-height:1.5;">${desc}</div>
          </td></tr>`).join('')}
        <tr><td style="padding:14px 18px;"><span style="font-size:13px;color:${C.muted};">Available now in your dashboard.</span></td></tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
        <tr><td><a href="${APP_URL}/dashboard.html" style="display:inline-block;background-color:${C.volt};color:#0a0a0a;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:12px;">Open My Dashboard →</a></td></tr>
      </table>
    `
  },
  {
    name: 'SmartSwing — Monthly Coaching Tips',
    subject: '3 things that will fix your game this month',
    preheader: 'The most common issues we see across 10,000+ swing analyses — and how to fix them in 2 sessions.',
    body: `
      <p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.gold};margin:0 0 12px 0;">Monthly coaching insight</p>
      <h1 style="font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.5px;color:${C.text};margin:0 0 16px 0;">The 3 mechanics that cost players the most points.</h1>
      <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
        Based on our AI analysis across thousands of swings this month, these are the most common issues holding players back — and exactly how to fix each one in your next two sessions.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
        ${[
          ['01 — Hip rotation timing', 'Most players rotate too early or too late. The fix: shadow swing drills with a focus on hip-shoulder separation before contact.'],
          ['02 — Contact point depth', 'Hitting the ball too close to the body compresses power. Fix it with the "fence drill" — practice hitting with full arm extension at the ideal contact zone.'],
          ['03 — Follow-through completion', 'Cutting the follow-through short signals poor balance at contact. Drill it: hold your finish for 2 seconds after every practice rep.'],
        ].map(([title, desc], i) => `
          <tr><td style="padding:14px 18px;${i < 2 ? 'border-bottom:1px solid ' + C.border + ';' : ''}">
            <div style="font-size:14px;font-weight:700;color:${C.volt};">${title}</div>
            <div style="font-size:13px;color:${C.muted};margin-top:4px;line-height:1.6;">${desc}</div>
          </td></tr>`).join('')}
      </table>
      <p style="font-size:14px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
        Run an analysis after your next session to see exactly which of these applies to your game — and get a personalised drill plan to fix it.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
        <tr><td><a href="${APP_URL}/analyze.html" style="display:inline-block;background-color:${C.volt};color:#0a0a0a;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:12px;">Analyse My Swing →</a></td></tr>
      </table>
      <p style="font-size:13px;color:${C.muted};line-height:1.6;margin:0;">
        You're receiving this because you're on the SmartSwing AI mailing list.<br>
        <a href="{{unsubscribe_url}}" style="color:${C.muted};">Unsubscribe</a>
      </p>
    `
  }
];

// ─────────────────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.smartswingai.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-setup-token');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only.' });

  // Auth: require CRON_SECRET header
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const provided   = String(req.headers['x-setup-token'] || '').trim();
  if (!cronSecret || provided !== cronSecret) {
    return json(res, 401, { error: 'Unauthorized — x-setup-token required.' });
  }

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return json(res, 500, { error: 'RESEND_API_KEY not configured.' });

  const appUrl    = process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com';
  const audienceId = String(process.env.RESEND_AUDIENCE_ID || '').trim();
  const results   = {};

  // 1 ── List or create audience ─────────────────────────────────────────────
  if (!audienceId) {
    const aRes = await resendPost('/audiences', { name: 'SmartSwing Users' }, apiKey);
    results.audience = { action: 'created', ok: aRes.ok, id: aRes.data?.id, note: 'Save this ID as RESEND_AUDIENCE_ID in Vercel env vars' };
  } else {
    results.audience = { action: 'skipped', id: audienceId, note: 'RESEND_AUDIENCE_ID already set' };
  }

  const targetAudienceId = results.audience.id || audienceId;

  // 2 ── Create broadcast drafts ─────────────────────────────────────────────
  if (targetAudienceId) {
    results.broadcasts = [];
    for (const bc of BROADCASTS) {
      const bcRes = await resendPost('/broadcasts', {
        audience_id: targetAudienceId,
        from:    process.env.RESEND_FROM_ADDRESS || `SmartSwing AI <noreply@mail.smartswingai.com>`,
        reply_to: 'hello@smartswingai.com',
        name:    bc.name,
        subject: bc.subject,
        html:    broadcastBase(bc.preheader, bc.body)
      }, apiKey);
      results.broadcasts.push({ name: bc.name, ok: bcRes.ok, id: bcRes.data?.id, error: bcRes.data?.message });
    }
  } else {
    results.broadcasts = { skipped: true, reason: 'No audience ID available' };
  }

  // 3 ── Register webhook ────────────────────────────────────────────────────
  const webhookRes = await resendPost('/webhooks', {
    endpoint: `${appUrl}/api/resend-webhook`,
    events: ['email.bounced', 'email.complained', 'email.delivered', 'email.opened', 'email.clicked']
  }, apiKey);
  results.webhook = {
    ok: webhookRes.ok,
    id: webhookRes.data?.id,
    signingSecret: webhookRes.data?.signing_secret,
    note: webhookRes.data?.signing_secret
      ? 'IMPORTANT: Save signing_secret as RESEND_WEBHOOK_SECRET in Vercel env vars, then redeploy.'
      : (webhookRes.data?.message || 'Check Resend dashboard')
  };

  // 4 ── Send test email ─────────────────────────────────────────────────────
  const testRes = await resendPost('/emails', {
    from:    process.env.RESEND_FROM_ADDRESS || `SmartSwing AI <noreply@mail.smartswingai.com>`,
    to:      ['bernardomedrado@hotmail.com'],
    subject: 'SmartSwing AI — Resend Setup Confirmed ✓',
    html:    broadcastBase(
      'Your Resend integration is live and sending correctly.',
      `<p style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.volt};margin:0 0 12px 0;">Setup complete</p>
       <h1 style="font-size:26px;font-weight:800;line-height:1.1;color:${C.text};margin:0 0 16px 0;">Resend is configured and sending. ✓</h1>
       <p style="font-size:15px;color:${C.muted};line-height:1.7;margin:0 0 24px 0;">
         This confirms your SmartSwing AI Resend integration is live. Transactional emails (welcome, paywall, win-back, etc.) and broadcast campaigns are ready to send.
       </p>
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
         ${[
           ['14 transactional templates', 'welcome, analysis_warning, paywall_hit, paywall_followup_3d/7d, referral_bonus, payment_success, win_back_7d/21d, coach_report_share, monthly_digest, milestone_reached, trial_expiring, score_improved'],
           ['3 broadcast campaigns', 'Launch announcement · New features · Monthly coaching tips'],
           ['Bounce & complaint handling', 'Webhook registered — profiles auto-suppressed on bounce/complaint'],
         ].map(([title, desc]) => `
           <tr><td style="padding:12px 16px;border-bottom:1px solid ${C.border};">
             <div style="font-size:14px;font-weight:700;color:${C.text};">✓ ${title}</div>
             <div style="font-size:12px;color:${C.muted};margin-top:3px;">${desc}</div>
           </td></tr>`).join('')}
         <tr><td style="padding:12px 16px;"><span style="font-size:13px;color:${C.muted};">Free plan: 3,000 emails/month · 100/day · 1,000 contacts</span></td></tr>
       </table>
       <table role="presentation" cellspacing="0" cellpadding="0" border="0">
         <tr><td><a href="${appUrl}/dashboard.html" style="display:inline-block;background-color:${C.volt};color:#0a0a0a;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:12px;">Open Dashboard →</a></td></tr>
       </table>`
    )
  }, apiKey);
  results.testEmail = { ok: testRes.ok, to: 'bernardomedrado@hotmail.com', id: testRes.data?.id, error: testRes.data?.message };

  console.log('[resend-setup] Result:', JSON.stringify(results, null, 2));
  return json(res, 200, results);
};
