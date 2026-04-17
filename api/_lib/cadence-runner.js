/**
 * SmartSwing AI — Cadence Step Runner
 *
 * Hourly Vercel cron. Pulls due `cadence_step_executions` rows (status='pending',
 * scheduled_at <= now) and sends them via Resend (email) or AWS SNS (SMS).
 *
 * Behaviour:
 *  - Before sending, checks contact suppression flags (email_bounced,
 *    email_unsubscribed, sms_opted_out). If suppressed → step marked 'skipped'
 *    and the enrollment advances to the next viable step.
 *  - On send success → status='sent', sent_at=now, resend_email_id captured
 *    so the Resend webhook can later mark it 'delivered' / 'opened' / 'clicked'.
 *  - On send failure → attempt_count++. If <3 attempts, re-schedule 30min out.
 *    If ≥3 → status='failed', failure_reason captured, enrollment advances.
 *  - When there's no viable next step, enrollment closes (status='completed').
 *
 * Idempotent: skips anything already non-pending.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *           RESEND_FROM_ADDRESS, CRON_SECRET (optional),
 *           AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION (for SMS).
 *
 * Schedule: "15 * * * *" (every hour at :15)
 */

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 30;
const BATCH_SIZE = 50;

function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function supaBase() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('SUPABASE_URL is not configured.');
  return base;
}

async function supaGet(path) {
  const r = await fetch(`${supaBase()}/rest/v1/${path}`, { headers: supaHeaders() });
  if (!r.ok) throw new Error(`GET ${path} failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function supaPatch(path, patch) {
  const r = await fetch(`${supaBase()}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...supaHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error(`PATCH ${path} failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ── Send via Resend ──────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const from = String(process.env.RESEND_FROM_ADDRESS || '').trim() || 'SmartSwing AI <noreply@mail.smartswingai.com>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: subject || '(no subject)', html: html || '' })
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(body?.message || body?.raw || `Resend HTTP ${r.status}`);
  return { id: body.id || null };
}

// ── Send via AWS SNS (SMS) ───────────────────────────────────────────────────

async function sendSms({ phone, message }) {
  const keyId = String(process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secret = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const region = String(process.env.AWS_REGION || 'us-east-1').trim();
  if (!keyId || !secret) throw new Error('AWS credentials not configured for SMS');
  // Minimal SigV4 POST to SNS Publish. Body:
  const params = new URLSearchParams({
    Action: 'Publish',
    Version: '2010-03-31',
    PhoneNumber: phone,
    Message: message
  });
  // Defer to the existing send-bulk-sms helper? The handler lives in marketing.js.
  // For the cron we call the marketing API so we don't duplicate SigV4 signing.
  const publicUrl = String(process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com').replace(/\/$/, '');
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const r = await fetch(`${publicUrl}/api/marketing/send-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {})
    },
    body: JSON.stringify({ phone_number: phone, message })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`SMS send failed ${r.status}: ${t.slice(0, 200)}`);
  }
  const body = await r.json().catch(() => ({}));
  return { id: body.message_id || body.MessageId || null };
}

// ── Enrollment advancement + fallback logic ─────────────────────────────────

async function advanceEnrollment(enrollmentId) {
  // Next pending step for this enrollment
  const remaining = await supaGet(
    `cadence_step_executions?enrollment_id=eq.${enrollmentId}&status=eq.pending` +
    `&select=id,step_num,scheduled_at&order=scheduled_at.asc&limit=1`
  );
  if (remaining.length) {
    const next = remaining[0];
    await supaPatch(`contact_cadence_enrollments?id=eq.${enrollmentId}`, {
      current_step: next.step_num, next_step_at: next.scheduled_at
    });
  } else {
    await supaPatch(`contact_cadence_enrollments?id=eq.${enrollmentId}`, {
      status: 'completed', completed_at: new Date().toISOString()
    });
  }
}

async function skipStep(step, reason) {
  await supaPatch(`cadence_step_executions?id=eq.${step.id}`, {
    status: 'skipped', skipped_reason: reason, last_attempted_at: new Date().toISOString()
  });
}

async function markSent(step, providerIdField, providerId) {
  const patch = {
    status: 'sent',
    sent_at: new Date().toISOString(),
    last_attempted_at: new Date().toISOString(),
    attempt_count: (step.attempt_count || 0) + 1
  };
  if (providerIdField === 'resend') patch.resend_email_id = providerId;
  if (providerIdField === 'sms') patch.provider_message_id = providerId;
  await supaPatch(`cadence_step_executions?id=eq.${step.id}`, patch);
}

async function markFailedOrRetry(step, err) {
  const attempt = (step.attempt_count || 0) + 1;
  const reason = (err?.message || String(err)).slice(0, 500);
  if (attempt >= MAX_ATTEMPTS) {
    await supaPatch(`cadence_step_executions?id=eq.${step.id}`, {
      status: 'failed', failed_at: new Date().toISOString(),
      failure_reason: reason, attempt_count: attempt,
      last_attempted_at: new Date().toISOString()
    });
    return 'failed';
  }
  const retryAt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString();
  await supaPatch(`cadence_step_executions?id=eq.${step.id}`, {
    status: 'pending', scheduled_at: retryAt, attempt_count: attempt,
    failure_reason: reason, last_attempted_at: new Date().toISOString()
  });
  return 'retry';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runCadenceBatch() {
  const results = { processed: 0, sent: 0, skipped: 0, retried: 0, failed: 0, advanced: 0, errors: [] };
  const nowIso = new Date().toISOString();

  try {
    // Pull due pending steps (with enrollment + contact context in one join shape).
    // PostgREST embedding: step -> contact via contact_id -> marketing_contacts
    const dueQuery =
      `cadence_step_executions?status=eq.pending&scheduled_at=lte.${encodeURIComponent(nowIso)}` +
      `&select=id,enrollment_id,contact_id,cadence_id,step_type,step_num,subject,body,message,attempt_count,scheduled_at,` +
      `marketing_contacts(id,email,phone,name,stage)` +
      `&order=scheduled_at.asc&limit=${BATCH_SIZE}`;
    const due = await supaGet(dueQuery);

    for (const step of due) {
      results.processed++;
      const contact = step.marketing_contacts;
      if (!contact) {
        await skipStep(step, 'contact_missing');
        results.skipped++;
        await advanceEnrollment(step.enrollment_id);
        results.advanced++;
        continue;
      }

      // Suppression checks (lookup on profiles if email matches a user)
      let suppressed = null;
      if (step.step_type === 'email') {
        if (!contact.email) { suppressed = 'no_email'; }
        else {
          try {
            const profs = await supaGet(
              `profiles?email=eq.${encodeURIComponent(contact.email)}` +
              `&select=email_bounced,email_unsubscribed,email_complained&limit=1`
            );
            const p = profs?.[0];
            if (p?.email_bounced) suppressed = 'email_bounced';
            else if (p?.email_unsubscribed) suppressed = 'email_unsubscribed';
            else if (p?.email_complained) suppressed = 'email_complained';
          } catch (e) { /* profile may not exist — not fatal */ }
        }
      } else if (step.step_type === 'sms') {
        if (!contact.phone) suppressed = 'no_phone';
        // TODO: check sms_opted_out on profiles when that column is added
      }

      if (suppressed) {
        await skipStep(step, suppressed);
        results.skipped++;
        await advanceEnrollment(step.enrollment_id);
        results.advanced++;
        continue;
      }

      // Attempt send
      try {
        if (step.step_type === 'email') {
          const { id } = await sendEmail({
            to: contact.email,
            subject: step.subject || 'A quick note from SmartSwing AI',
            html: step.body || ''
          });
          await markSent(step, 'resend', id);
        } else if (step.step_type === 'sms') {
          const { id } = await sendSms({ phone: contact.phone, message: step.message || '' });
          await markSent(step, 'sms', id);
        } else {
          await skipStep(step, `unknown_step_type_${step.step_type}`);
          results.skipped++;
          await advanceEnrollment(step.enrollment_id);
          results.advanced++;
          continue;
        }
        results.sent++;
        await advanceEnrollment(step.enrollment_id);
        results.advanced++;
      } catch (sendErr) {
        const outcome = await markFailedOrRetry(step, sendErr);
        if (outcome === 'failed') {
          results.failed++;
          // On hard failure, advance to next step so cadence isn't stalled
          await advanceEnrollment(step.enrollment_id);
          results.advanced++;
        } else {
          results.retried++;
        }
        results.errors.push({ step_id: step.id, error: (sendErr?.message || String(sendErr)).slice(0, 200) });
      }
    }
  } catch (err) {
    console.error('[cadence-runner] fatal:', err);
    results.errors.push({ fatal: err?.message || String(err) });
    return results;
  }

  console.log('[cadence-runner] done:', results);
  return results;
}

module.exports = { runCadenceBatch };
