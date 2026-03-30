/**
 * SmartSwing AI — Transactional Email Endpoint
 *
 * POST /api/send-email
 * Body: { type, data: { firstName, email, ... } }
 *
 * Sends via Resend (https://resend.com).
 * Requires RESEND_API_KEY environment variable.
 *
 * From address: configure RESEND_FROM_ADDRESS in Vercel env vars.
 * Default: "SmartSwing AI <noreply@smartswingai.com>"
 * Note: the sender domain must be verified in Resend dashboard first.
 *
 * Event types:
 *   welcome           — sent after account creation
 *   analysis_warning  — sent after 1st of 2 free analyses is consumed
 *   paywall_hit       — sent when free plan limit is reached
 *   payment_success   — sent after Stripe checkout completes
 *   win_back_7d       — sent 7 days after signup if no analysis recorded
 *   win_back_21d      — sent 21 days after signup if still on free plan
 */

const { renderTemplate } = require('./_lib/email-templates');

const RESEND_API = 'https://api.resend.com/emails';
const ALLOWED_TYPES = ['welcome', 'analysis_warning', 'paywall_hit', 'payment_success', 'win_back_7d', 'win_back_21d'];
const MAX_BODY_BYTES = 8 * 1024; // 8 KB — well above any realistic payload

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function sendViaResend({ apiKey, from, to, subject, html }) {
  const response = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html })
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    throw new Error(body?.message || body?.raw || `Resend returned HTTP ${response.status}`);
  }

  return body;
}

module.exports = async (req, res) => {
  // CORS preflight — allow the SmartSwing app origin
  const allowedOrigin = process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  // ── Resend configuration check ──────────────────────────────────────────
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    // Email is not configured — return 200 so the client doesn't treat it as a hard error
    console.warn('[send-email] RESEND_API_KEY is not set — email skipped.');
    return json(res, 200, { skipped: true, reason: 'Email service not configured.' });
  }

  // ── Parse request ────────────────────────────────────────────────────────
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return json(res, 400, { error: err.message || 'Invalid request body.' });
  }

  const type = String(body.type || '').trim();
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return json(res, 400, {
      error: `Invalid email type "${type}". Valid types: ${ALLOWED_TYPES.join(', ')}`
    });
  }

  const data = body.data || {};
  const recipientEmail = String(data.email || '').trim().toLowerCase();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return json(res, 400, { error: 'A valid recipient email address is required.' });
  }

  // Sanitise firstName — no HTML injection
  if (data.firstName) {
    data.firstName = String(data.firstName).replace(/[<>"&]/g, '').slice(0, 80).trim() || 'there';
  }

  // ── Render template ──────────────────────────────────────────────────────
  let subject, html;
  try {
    ({ subject, html } = renderTemplate(type, data));
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  // ── Send via Resend ──────────────────────────────────────────────────────
  const from = String(process.env.RESEND_FROM_ADDRESS || '').trim() || 'SmartSwing AI <noreply@smartswingai.com>';

  try {
    const result = await sendViaResend({ apiKey, from, to: recipientEmail, subject, html });
    console.log(`[send-email] Sent "${type}" to ${recipientEmail} (id: ${result?.id || 'unknown'})`);
    return json(res, 200, { sent: true, id: result?.id || null, type });
  } catch (err) {
    // Log but don't expose full error to client
    console.error(`[send-email] Resend error for "${type}" to ${recipientEmail}:`, err.message);
    return json(res, 500, { error: 'Failed to send email. Please try again later.' });
  }
};
