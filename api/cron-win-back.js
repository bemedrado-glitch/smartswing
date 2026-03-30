/**
 * SmartSwing AI — Win-Back Email Cron
 *
 * Called daily by Vercel Cron (requires Vercel Pro or higher).
 * Schedule: "0 10 * * *" (10:00 UTC every day)
 *
 * Sends:
 *   win_back_7d  — to users who signed up 7 days ago with 0 analyses recorded
 *   win_back_21d — to users who signed up 21 days ago still on the free plan
 *
 * Env vars required:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (never exposes to client)
 *   RESEND_API_KEY            — Resend API key
 *   CRON_SECRET               — Shared secret; Vercel sets this automatically
 *
 * Vercel passes `Authorization: Bearer {CRON_SECRET}` for cron requests.
 * Set CRON_SECRET in Vercel environment variables to protect this endpoint.
 */

const { renderTemplate } = require('./_lib/email-templates');

const RESEND_API = 'https://api.resend.com/emails';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

function getSupabaseHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function supabaseUrl(path) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('SUPABASE_URL is not configured.');
  return `${base}/rest/v1/${path}`;
}

async function supabaseQuery(path) {
  const res = await fetch(supabaseUrl(path), { headers: getSupabaseHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase query failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ── Resend helper ────────────────────────────────────────────────────────────

async function sendEmail(type, data) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey || !data?.email) return false;
  try {
    const { subject, html } = renderTemplate(type, data);
    const from = String(process.env.RESEND_FROM_ADDRESS || '').trim() || 'SmartSwing AI <noreply@smartswingai.com>';
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: data.email, subject, html })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[cron-win-back] Resend ${type} failed (${res.status}):`, text.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[cron-win-back] sendEmail error:', err?.message || err);
    return false;
  }
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function dayRange(daysAgo, windowHours = 24) {
  const end = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - windowHours * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── Main handler ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  // Only GET (Vercel cron) or POST (manual trigger) allowed
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  // Protect with CRON_SECRET — Vercel sends Bearer token automatically
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  if (cronSecret) {
    const auth = String(req.headers['authorization'] || '').trim();
    if (auth !== `Bearer ${cronSecret}`) {
      return json(res, 401, { error: 'Unauthorized.' });
    }
  }

  if (!String(process.env.RESEND_API_KEY || '').trim()) {
    console.warn('[cron-win-back] RESEND_API_KEY not set — skipping.');
    return json(res, 200, { skipped: true, reason: 'Email service not configured.' });
  }

  const results = { win_back_7d: { sent: 0, errors: 0 }, win_back_21d: { sent: 0, errors: 0 } };

  try {
    // ── 7-day win-back: signed up 7 days ago, 0 assessments ────────────────
    const range7 = dayRange(7);
    // Fetch profiles created in the 7-day window that are still on free tier
    const profiles7 = await supabaseQuery(
      `profiles?select=id,email,full_name,subscription_tier,created_at` +
      `&created_at=gte.${range7.start}` +
      `&created_at=lte.${range7.end}` +
      `&subscription_tier=eq.free`
    );

    for (const profile of (profiles7 || [])) {
      try {
        // Check if they have any assessments
        const assessments = await supabaseQuery(
          `assessments?select=id&user_id=eq.${profile.id}&limit=1`
        );
        if (!assessments || assessments.length === 0) {
          const firstName = (profile.full_name || '').split(' ')[0] || 'there';
          const sent = await sendEmail('win_back_7d', { firstName, email: profile.email });
          if (sent) results.win_back_7d.sent++;
        }
      } catch (err) {
        results.win_back_7d.errors++;
        console.warn('[cron-win-back] win_back_7d user error:', profile.id, err?.message);
      }
    }

    // ── 21-day win-back: signed up 21 days ago, still on free tier ─────────
    const range21 = dayRange(21);
    const profiles21 = await supabaseQuery(
      `profiles?select=id,email,full_name,subscription_tier,created_at` +
      `&created_at=gte.${range21.start}` +
      `&created_at=lte.${range21.end}` +
      `&subscription_tier=eq.free`
    );

    for (const profile of (profiles21 || [])) {
      try {
        const firstName = (profile.full_name || '').split(' ')[0] || 'there';
        const sent = await sendEmail('win_back_21d', { firstName, email: profile.email });
        if (sent) results.win_back_21d.sent++;
      } catch (err) {
        results.win_back_21d.errors++;
        console.warn('[cron-win-back] win_back_21d user error:', profile.id, err?.message);
      }
    }
  } catch (err) {
    console.error('[cron-win-back] Fatal error:', err?.message || err);
    return json(res, 500, { error: err?.message || 'Cron job failed.', results });
  }

  console.log('[cron-win-back] Completed:', results);
  return json(res, 200, { ok: true, results });
};
