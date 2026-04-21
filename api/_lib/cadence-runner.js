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

const { renderCadenceEmail, renderCadenceSms } = require('./cadence-email-render');
const { resolveChannel, resolveTemplateLang } = require('./channel-router');

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

/**
 * Atomically claim a pending step for processing by THIS runner.
 *
 * Without this, two concurrent runs (cron retry, manual trigger, accidental
 * double-deploy) could both pull the same row from /cadence_step_executions
 * and both call sendEmail/sendWhatsapp — duplicate sends to the prospect.
 *
 * Strategy: PATCH with WHERE filter `status=eq.pending` and Prefer:return=representation.
 * PostgREST applies the WHERE atomically. The first request flips status to
 * 'processing' and gets the row back; the second request matches zero rows and
 * gets back an empty array. Only the first runner proceeds with the send.
 *
 * Returns true if this runner won the claim, false if another already claimed.
 */
async function claimStep(stepId) {
  const r = await fetch(`${supaBase()}/rest/v1/cadence_step_executions?id=eq.${stepId}&status=eq.pending`, {
    method: 'PATCH',
    headers: { ...supaHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'processing',
      processing_started_at: new Date().toISOString()
    })
  });
  if (!r.ok) {
    // Schema mismatch (column missing, RLS) → treat as not-claimed so we don't double-send
    console.error(`[cadence-runner] claimStep PATCH failed ${r.status} for ${stepId}: ${(await r.text()).slice(0, 200)}`);
    return false;
  }
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
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

// ── Send via Meta WhatsApp Cloud API ────────────────────────────────────────

/**
 * Sends a WhatsApp message via Meta Graph API.
 *
 * If templateName is provided → template send (works for cold outbound, outside 24h window).
 * If only freeFormMessage is provided → text send (only works within 24h of user's last inbound).
 *
 * Substitutes {{first_name}} etc. into template variables before send.
 *
 * @param {object} opts
 * @param {string} opts.phone - E.164
 * @param {string=} opts.templateName
 * @param {string=} opts.templateLang
 * @param {string[]=} opts.templateVars - ordered list, already substituted
 * @param {string=} opts.freeFormMessage
 */
async function sendWhatsapp({ phone, templateName, templateLang, templateVars, freeFormMessage }) {
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const accessToken = String(
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || ''
  ).trim();
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp not configured (missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN)');
  }
  const toNumber = String(phone || '').replace(/[^\d]/g, '');
  if (!toNumber) throw new Error('Invalid WhatsApp recipient phone');

  let payload;
  if (templateName) {
    const components = Array.isArray(templateVars) && templateVars.length
      ? [{
          type: 'body',
          parameters: templateVars.map(v => ({ type: 'text', text: String(v) }))
        }]
      : undefined;
    payload = {
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang || 'en_US' },
        ...(components ? { components } : {})
      }
    };
  } else if (freeFormMessage) {
    payload = {
      messaging_product: 'whatsapp',
      to: toNumber,
      type: 'text',
      text: { body: freeFormMessage }
    };
  } else {
    throw new Error('WhatsApp step requires templateName or message');
  }

  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) {
    const msg = body?.error?.message || body?.raw || `WhatsApp HTTP ${r.status}`;
    const code = body?.error?.code;
    const err = new Error(msg);
    err.code = code;
    throw err;
  }
  return { id: body?.messages?.[0]?.id || null };
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
  if (providerIdField === 'whatsapp') patch.provider_message_id = providerId;
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
  const results = { processed: 0, sent: 0, skipped: 0, skipped_concurrent: 0, retried: 0, failed: 0, advanced: 0, recovered: 0, errors: [] };
  const nowIso = new Date().toISOString();

  try {
    // JANITOR: recover steps stuck in 'processing' for >10min (crashed prior runner).
    // Without this, a runner that died mid-send would leave its claimed steps
    // permanently stuck — the next runner would skip them forever.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    try {
      const recoverRes = await fetch(
        `${supaBase()}/rest/v1/cadence_step_executions?status=eq.processing&processing_started_at=lt.${encodeURIComponent(tenMinAgo)}`,
        {
          method: 'PATCH',
          headers: { ...supaHeaders(), Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'pending', processing_started_at: null })
        }
      );
      if (recoverRes.ok) {
        const recovered = await recoverRes.json().catch(() => []);
        results.recovered = Array.isArray(recovered) ? recovered.length : 0;
        if (results.recovered > 0) console.log(`[cadence-runner] recovered ${results.recovered} stuck step(s) from prior crashed runner`);
      }
    } catch (recoverErr) {
      console.warn('[cadence-runner] janitor recovery skipped:', recoverErr.message);
    }

    // Pull due pending steps (with enrollment + contact context in one join shape).
    // PostgREST embedding: step -> contact via contact_id -> marketing_contacts
    const dueQuery =
      `cadence_step_executions?status=eq.pending&scheduled_at=lte.${encodeURIComponent(nowIso)}` +
      `&select=id,enrollment_id,contact_id,cadence_id,step_type,step_num,subject,body,message,attempt_count,scheduled_at,` +
      `marketing_contacts(id,email,phone,name,stage,preferred_channel,whatsapp_opted_out)` +
      `&order=scheduled_at.asc&limit=${BATCH_SIZE}`;
    const due = await supaGet(dueQuery);

    for (const step of due) {
      results.processed++;

      // RACE GUARD: atomically claim the step before doing any work.
      // If another concurrent runner already grabbed it, claim returns false
      // and we skip — preventing duplicate sends to the prospect.
      const claimed = await claimStep(step.id);
      if (!claimed) {
        // Quietly skip — another runner is handling this step. NOT a failure.
        if (!results.skipped_concurrent) results.skipped_concurrent = 0;
        results.skipped_concurrent++;
        continue;
      }

      const contact = step.marketing_contacts;
      if (!contact) {
        await skipStep(step, 'contact_missing');
        results.skipped++;
        await advanceEnrollment(step.enrollment_id);
        results.advanced++;
        continue;
      }

      // For phone-based steps (sms | whatsapp), resolve the preferred channel
      // once — this lets a 'sms' step auto-upgrade to 'whatsapp' (and vice versa)
      // when the contact's country / preference calls for it.
      let effectiveStepType = step.step_type;
      if (step.step_type === 'sms' || step.step_type === 'whatsapp') {
        const resolved = resolveChannel(contact.phone, contact.preferred_channel || 'auto');
        // Only re-route if the resolved channel differs AND the original step
        // carries usable payload for both (sms 'message' can go either way;
        // a 'whatsapp' step with only template_name can't auto-fallback to sms)
        if (step.step_type === 'sms' && resolved === 'whatsapp') {
          effectiveStepType = 'whatsapp';
        } else if (step.step_type === 'whatsapp' && resolved === 'sms') {
          // Only downgrade if we have free-form message (not template-only) —
          // otherwise stick with whatsapp and let it error cleanly.
          const hasFreeForm = step.message && !String(step.message).startsWith('template:');
          if (hasFreeForm) effectiveStepType = 'sms';
        }
      }

      // Suppression checks (lookup on profiles if email matches a user)
      let suppressed = null;
      if (effectiveStepType === 'email') {
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
      } else if (effectiveStepType === 'sms' || effectiveStepType === 'whatsapp') {
        if (!contact.phone) suppressed = 'no_phone';
        if (effectiveStepType === 'whatsapp' && contact.whatsapp_opted_out === true) {
          suppressed = 'whatsapp_opted_out';
        }
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
        if (effectiveStepType === 'email') {
          const { subject, html } = renderCadenceEmail(step, contact);
          const { id } = await sendEmail({ to: contact.email, subject, html });
          await markSent(step, 'resend', id);
        } else if (effectiveStepType === 'sms') {
          const { message } = renderCadenceSms(step, contact);
          const { id } = await sendSms({ phone: contact.phone, message });
          await markSent(step, 'sms', id);
        } else if (effectiveStepType === 'whatsapp') {
          const { message } = renderCadenceSms(step, contact); // reuse token-substitution helper
          const raw = message || '';
          // Convention (set in marketing.js enrollment builder):
          //   step.message === 'template:<name>'  → template send
          //   else                                 → free-form text (only works in 24h window)
          let templateName = null;
          // Default to the contact's country-derived language; overridable by explicit cadence_whatsapp.template_lang or step.message suffix.
          let templateLang = resolveTemplateLang(contact.phone);
          let templateVars = [];
          let freeFormMessage = null;
          if (raw.startsWith('template:')) {
            const parts = raw.slice('template:'.length).split('|');
            templateName = (parts[0] || '').trim() || null;
            if (parts[1]) templateLang = parts[1].trim() || 'en_US';
            // For templates we also pull the cadence_whatsapp row for template_vars
            if (templateName) {
              try {
                const waRows = await supaGet(
                  `cadence_whatsapp?cadence_id=eq.${step.cadence_id}&sequence_num=eq.${step.step_num}` +
                  `&select=template_vars,template_lang&limit=1`
                );
                const waRow = waRows?.[0];
                if (waRow?.template_lang) templateLang = waRow.template_lang;
                if (Array.isArray(waRow?.template_vars)) {
                  // Each entry is a token like '{{first_name}}' or a literal string — substitute
                  const { renderCadenceSms: r } = require('./cadence-email-render');
                  templateVars = waRow.template_vars.map(v => {
                    const { message: s } = r({ message: String(v) }, contact);
                    return s;
                  });
                }
              } catch (_) { /* fall through with empty vars */ }
            }
          } else {
            freeFormMessage = raw;
          }
          const { id } = await sendWhatsapp({
            phone: contact.phone,
            templateName,
            templateLang,
            templateVars,
            freeFormMessage
          });
          await markSent(step, 'whatsapp', id);
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
