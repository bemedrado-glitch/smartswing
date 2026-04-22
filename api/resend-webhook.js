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

  // Inbound email replies (Tier 2 #6) are delivered by Resend as the same
  // webhook type but with a different event name. We fold handling here
  // instead of adding a new serverless function (Vercel Hobby cap).
  if (type === 'email.inbound' || type === 'inbound.email') {
    try {
      const threadId = await handleInboundEmail(event?.data || {});
      return json(res, 200, { received: true, type, thread_id: threadId });
    } catch (err) {
      console.error('[resend-webhook] Inbound handler failed:', err?.message || err);
      // 200 so Resend does not infinitely retry on our schema bugs — we log
      // and move on. A dead-letter queue could be added later for replay.
      return json(res, 200, { received: true, type, error: String(err?.message || err) });
    }
  }

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

    // Also mark the matching cadence_step_executions row if we can link
    // it via the Resend email_id. This gives the Leads tab real delivery /
    // open / click status — not just "we called the API".
    try {
      const resendEmailId = event?.data?.email_id || null;
      if (resendEmailId) {
        const stepPatch = {};
        if (type === 'email.delivered') { stepPatch.delivered_at = new Date().toISOString(); stepPatch.status = 'delivered'; }
        else if (type === 'email.opened') { stepPatch.opened_at = new Date().toISOString(); }
        else if (type === 'email.clicked') { stepPatch.clicked_at = new Date().toISOString(); }
        else if (type === 'email.bounced') { stepPatch.failed_at = new Date().toISOString(); stepPatch.status = 'failed'; stepPatch.failure_reason = 'bounced'; }
        else if (type === 'email.complained') { stepPatch.failed_at = new Date().toISOString(); stepPatch.status = 'failed'; stepPatch.failure_reason = 'complained'; }
        if (Object.keys(stepPatch).length) {
          const url = `${supabaseBase()}/rest/v1/cadence_step_executions?resend_email_id=eq.${encodeURIComponent(resendEmailId)}`;
          await fetch(url, {
            method: 'PATCH',
            headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
            body: JSON.stringify(stepPatch)
          });
          console.log(`[resend-webhook] Updated step execution(s) for ${resendEmailId} -> ${type}`);
        }
      }
    } catch (stepErr) {
      console.warn('[resend-webhook] step execution update failed (non-fatal):', stepErr?.message || stepErr);
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

// ── Inbound email → inbox_messages threading (Tier 2 #6) ─────────────────────
// Threads via In-Reply-To / References first, falls back to subject match.

function normaliseMessageId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.trim().replace(/^<|>$/g, '');
}

function collectCandidateIds(data) {
  const ids = [];
  const push = (x) => { const v = normaliseMessageId(x); if (v) ids.push(v); };
  push(data.in_reply_to);
  if (Array.isArray(data.references)) data.references.forEach(push);
  return [...new Set(ids)];
}

async function supabaseGet(pathAndQuery) {
  const url = `${supabaseBase()}/rest/v1/${pathAndQuery}`;
  const r = await fetch(url, { headers: supabaseHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${pathAndQuery} failed (${r.status})`);
  return r.json();
}

async function supabasePost(table, body) {
  const url = `${supabaseBase()}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Supabase POST ${table} failed (${r.status}): ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function findThreadByReferences(candidateIds) {
  if (!candidateIds.length) return null;
  const inList = candidateIds.map(id => `"${id.replace(/"/g, '\\"')}"`).join(',');
  const q = `inbox_messages?email_message_id=in.(${encodeURIComponent(inList)})&select=thread_id&limit=1`;
  const rows = await supabaseGet(q);
  return rows[0]?.thread_id || null;
}

async function findThreadBySubject(subject) {
  if (!subject) return null;
  const normalised = subject.replace(/^\s*(re|fwd|fw)\s*:\s*/i, '').trim();
  if (!normalised) return null;
  const q = `inbox_threads?subject=eq.${encodeURIComponent(normalised)}&order=last_message_at.desc&limit=1`;
  const rows = await supabaseGet(q);
  return rows[0]?.id || null;
}

async function findProfileByEmail(email) {
  if (!email) return null;
  const q = `profiles?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id&limit=1`;
  const rows = await supabaseGet(q);
  return rows[0]?.id || null;
}

async function handleInboundEmail(data) {
  const fromEmail = String(data.from || '').toLowerCase().trim();
  const subject   = (data.subject || '(no subject)').toString().slice(0, 500);
  const bodyText  = (data.text || data.html || '').toString().slice(0, 50000);
  const emailMessageId = normaliseMessageId(data.message_id);
  const candidateIds   = collectCandidateIds(data);

  let threadId  = await findThreadByReferences(candidateIds);
  if (!threadId) threadId = await findThreadBySubject(subject);

  const fromUserId = await findProfileByEmail(fromEmail);

  if (!threadId) {
    const [thread] = await supabasePost('inbox_threads', [{
      subject,
      owner_user_id: fromUserId,
      last_message_preview: bodyText.slice(0, 140),
      status: 'open'
    }]);
    threadId = thread.id;
  }

  await supabasePost('inbox_messages', [{
    thread_id: threadId,
    from_user_id: fromUserId,
    from_name: data.from_name || fromEmail,
    subject,
    body: bodyText,
    channel: 'email',
    direction: 'inbound',
    email_message_id: emailMessageId || null,
    external_id: emailMessageId || null
  }]);

  return threadId;
}
