/**
 * SmartSwing AI — Resend Email Event Webhook
 *
 * POST /api/resend-webhook
 *
 * Listens for Resend email delivery events and updates the user profile:
 *   email.bounced    → marks email_bounced = true  (stops all future sends)
 *   email.complained → marks email_complained = true + email_unsubscribed = true
 *
 * Setup (one-time, in Resend dashboard):
 *   1. Go to Resend → Webhooks → Add endpoint
 *   2. URL: https://www.smartswingai.com/api/resend-webhook
 *   3. Events: email.bounced, email.complained  (optionally email.delivered)
 *   4. Copy the signing secret → set RESEND_WEBHOOK_SECRET in Vercel env vars
 *
 * Env vars required:
 *   RESEND_WEBHOOK_SECRET     — Svix signing secret from Resend (starts with whsec_)
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (server-side only)
 *   RESEND_AUDIENCE_ID        — (optional) Resend audience ID for contact sync
 *   RESEND_API_KEY            — (optional) needed to sync unsubscribes to audience
 */

const { verifyResendWebhook, unsubscribeResendContact } = require('./_lib/resend-common');

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Supabase helper ───────────────────────────────────────────────────────────

function supabaseHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function supabaseBase() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('SUPABASE_URL is not configured.');
  return base;
}

async function patchProfileByEmail(email, patch) {
  const url = `${supabaseBase()}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase PATCH failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return json(res, 400, { error: 'Unable to read request body.' });
  }

  let event;
  try {
    event = await verifyResendWebhook(rawBody, req.headers);
  } catch (err) {
    console.warn('[resend-webhook] Signature verification failed:', err.message);
    return json(res, 400, { error: err.message });
  }

  const type  = event?.type  || '';
  const email = event?.data?.email_id
    ? (event?.data?.to?.[0] || event?.data?.to || '')
    : (event?.data?.email || '');

  console.log(`[resend-webhook] Received "${type}" for ${email || '(no email)'}`);

  try {
    if (type === 'email.bounced') {
      if (email) {
        await patchProfileByEmail(email, {
          email_bounced: true,
          email_unsubscribed: true
        });
        await unsubscribeResendContact(email);
        console.log(`[resend-webhook] Marked bounced: ${email}`);
      }
    } else if (type === 'email.complained') {
      if (email) {
        await patchProfileByEmail(email, {
          email_complained: true,
          email_unsubscribed: true,
          marketing_opted_in: false
        });
        await unsubscribeResendContact(email);
        console.log(`[resend-webhook] Marked complained/unsubscribed: ${email}`);
      }
    }

    // Store delivery/open/click events for marketing dashboard analytics
    const TRACKED_EVENTS = new Set(['email.delivered', 'email.opened', 'email.clicked']);
    if (TRACKED_EVENTS.has(type)) {
      try {
        const eventRow = {
          event_type: type.replace('email.', 'email_'),
          email: email || null,
          subject: event?.data?.subject || null,
          metadata: {
            resend_email_id: event?.data?.email_id || null,
            tags: event?.data?.tags || [],
            timestamp: event?.created_at || new Date().toISOString()
          }
        };
        const insertUrl = `${supabaseBase()}/rest/v1/email_events`;
        await fetch(insertUrl, {
          method: 'POST',
          headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify(eventRow)
        });
        console.log(`[resend-webhook] Stored ${type} event for ${email}`);
      } catch (storeErr) {
        // Non-fatal — log but don't fail the webhook
        console.warn('[resend-webhook] Failed to store email event:', storeErr?.message || storeErr);
      }
    }
  } catch (err) {
    console.error('[resend-webhook] Handler error:', err?.message || err);
    return json(res, 500, { error: 'Internal error processing webhook.' });
  }

  return json(res, 200, { received: true, type });
};
