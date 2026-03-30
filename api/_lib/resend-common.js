/**
 * SmartSwing AI — Resend shared helpers
 *
 * Audience contact sync + webhook signature verification.
 * Requires env vars:
 *   RESEND_API_KEY          — Resend API key
 *   RESEND_AUDIENCE_ID      — Resend Audience ID (create in Resend → Audiences)
 *   RESEND_WEBHOOK_SECRET   — Signing secret from Resend → Webhooks (svix-based)
 */

const RESEND_BASE = 'https://api.resend.com';

function resendKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function audienceId() {
  return String(process.env.RESEND_AUDIENCE_ID || '').trim();
}

// ── Contact sync ─────────────────────────────────────────────────────────────

/**
 * Upsert a contact in the Resend audience.
 * Safe to call on every welcome/signup — idempotent by email.
 *
 * @param {object} opts
 * @param {string} opts.email
 * @param {string} [opts.firstName]
 * @param {string} [opts.lastName]
 * @param {boolean} [opts.unsubscribed]  — pass true to suppress future broadcasts
 */
async function syncResendContact({ email, firstName = '', lastName = '', unsubscribed = false } = {}) {
  const key = resendKey();
  const aid = audienceId();
  if (!key || !aid || !email) return null;

  try {
    const res = await fetch(`${RESEND_BASE}/audiences/${aid}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        unsubscribed
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[resend-common] syncContact failed:', res.status, body?.message || '');
      return null;
    }
    return body?.id || null;
  } catch (err) {
    console.warn('[resend-common] syncContact error:', err?.message || err);
    return null;
  }
}

/**
 * Mark a contact as unsubscribed (hard bounce or spam complaint).
 * Uses PATCH to update the existing contact record.
 */
async function unsubscribeResendContact(email) {
  const key = resendKey();
  const aid = audienceId();
  if (!key || !aid || !email) return;

  try {
    // Resend upsert with unsubscribed=true
    await fetch(`${RESEND_BASE}/audiences/${aid}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, unsubscribed: true })
    });
  } catch (err) {
    console.warn('[resend-common] unsubscribeContact error:', err?.message || err);
  }
}

// ── Webhook signature verification (Svix) ────────────────────────────────────

/**
 * Verify the Resend webhook signature.
 * Resend uses Svix under the hood — headers: svix-id, svix-timestamp, svix-signature.
 *
 * Returns the parsed event body if valid, throws if invalid.
 */
async function verifyResendWebhook(rawBody, headers) {
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    // No secret configured — skip verification (dev mode)
    return JSON.parse(rawBody.toString('utf8'));
  }

  const msgId        = headers['svix-id']        || '';
  const msgTimestamp = headers['svix-timestamp']  || '';
  const msgSignature = headers['svix-signature']  || '';

  if (!msgId || !msgTimestamp || !msgSignature) {
    throw new Error('Missing Svix webhook headers.');
  }

  // Reject timestamps older than 5 minutes (replay protection)
  const tsSeconds = parseInt(msgTimestamp, 10);
  if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
    throw new Error('Webhook timestamp too old or invalid.');
  }

  // Compute expected signature: HMAC-SHA256 of "<msgId>.<msgTimestamp>.<rawBody>"
  const { createHmac } = require('crypto');
  const toSign = `${msgId}.${msgTimestamp}.${rawBody.toString('utf8')}`;

  // Resend encodes the secret as base64 after the "whsec_" prefix
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expectedSig = createHmac('sha256', secretBytes).update(toSign).digest('base64');

  // msgSignature may be a space-separated list of "v1,<sig>" pairs
  const sigs = msgSignature.split(' ').map(s => s.replace(/^v\d+,/, ''));
  if (!sigs.includes(expectedSig)) {
    throw new Error('Webhook signature mismatch.');
  }

  return JSON.parse(rawBody.toString('utf8'));
}

module.exports = { syncResendContact, unsubscribeResendContact, verifyResendWebhook };
