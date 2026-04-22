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
const { runCadenceBatch } = require('./_lib/cadence-runner');
const { runPublishBatch } = require('./_lib/publish-runner');
const { runLeadScoringBatch } = require('./_lib/lead-scoring');
const { runMetricsFetch } = require('./_lib/content-metrics');
const { runVariantRotation } = require('./_lib/ab-rotator');
const { runWeeklyDigest } = require('./_lib/cmo-digest');

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
    const from = String(process.env.RESEND_FROM_ADDRESS || '').trim() || 'SmartSwing AI <noreply@mail.smartswingai.com>';
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

  const results = {
    onboarding_d1_no_analysis: { sent: 0, errors: 0 },
    onboarding_d7_progress: { sent: 0, errors: 0 },
    win_back_7d: { sent: 0, errors: 0 },
    win_back_21d: { sent: 0, errors: 0 },
    paywall_followup_3d: { sent: 0, errors: 0 },
    paywall_followup_7d: { sent: 0, errors: 0 }
  };

  try {
    // ── Tier 1 #2 — D1 onboarding nudge: signed up 24h ago, 0 analyses yet ─
    const range1 = dayRange(1);
    const profiles1 = await supabaseQuery(
      `profiles?select=id,email,full_name,created_at` +
      `&created_at=gte.${range1.start}` +
      `&created_at=lte.${range1.end}`
    );
    for (const profile of (profiles1 || [])) {
      try {
        const assessments = await supabaseQuery(
          `assessments?select=id&user_id=eq.${profile.id}&limit=1`
        );
        if (!assessments || assessments.length === 0) {
          const firstName = (profile.full_name || '').split(' ')[0] || 'there';
          const sent = await sendEmail('onboarding_d1_no_analysis', { firstName, email: profile.email });
          if (sent) results.onboarding_d1_no_analysis.sent++;
        }
      } catch (err) {
        results.onboarding_d1_no_analysis.errors++;
        console.warn('[cron-win-back] onboarding_d1 user error:', profile.id, err?.message);
      }
    }

    // ── Tier 1 #2 — D7 progress check-in: signed up 7d ago, ≥1 analysis ────
    // (Runs parallel to the existing win_back_7d which targets 0-analysis users.
    // These two queries are mutually exclusive by the assessments check.)
    const range7check = dayRange(7);
    const profiles7ck = await supabaseQuery(
      `profiles?select=id,email,full_name,created_at,subscription_tier` +
      `&created_at=gte.${range7check.start}` +
      `&created_at=lte.${range7check.end}` +
      `&subscription_tier=eq.free`
    );
    for (const profile of (profiles7ck || [])) {
      try {
        const assessments = await supabaseQuery(
          `assessments?select=id,shot_type,overall_score&user_id=eq.${profile.id}&order=created_at.desc&limit=1`
        );
        if (assessments && assessments.length > 0) {
          const firstName = (profile.full_name || '').split(' ')[0] || 'there';
          const sent = await sendEmail('onboarding_d7_progress', {
            firstName,
            email: profile.email,
            lastScore: assessments[0].overall_score || null,
            lastShotType: assessments[0].shot_type || 'forehand'
          });
          if (sent) results.onboarding_d7_progress.sent++;
        }
      } catch (err) {
        results.onboarding_d7_progress.errors++;
        console.warn('[cron-win-back] onboarding_d7 user error:', profile.id, err?.message);
      }
    }

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

    // ── Paywall follow-up 3d: hit paywall 3 days ago, still on free ────────
    const results_p3 = { sent: 0, errors: 0 };
    results.paywall_followup_3d = results_p3;
    const range3d = dayRange(3);
    const paywallProfiles3 = await supabaseQuery(
      `profiles?select=id,email,full_name,subscription_tier` +
      `&paywall_hit_at=gte.${range3d.start}` +
      `&paywall_hit_at=lte.${range3d.end}` +
      `&subscription_tier=eq.free`
    );
    for (const profile of (paywallProfiles3 || [])) {
      try {
        const firstName = (profile.full_name || '').split(' ')[0] || 'there';
        const sent = await sendEmail('paywall_followup_3d', { firstName, email: profile.email });
        if (sent) results_p3.sent++;
      } catch (err) {
        results_p3.errors++;
        console.warn('[cron-win-back] paywall_followup_3d error:', profile.id, err?.message);
      }
    }

    // ── Paywall follow-up 7d: hit paywall 7 days ago, still on free ────────
    const results_p7 = { sent: 0, errors: 0 };
    results.paywall_followup_7d = results_p7;
    const range7d_paywall = dayRange(7);
    const paywallProfiles7 = await supabaseQuery(
      `profiles?select=id,email,full_name,subscription_tier` +
      `&paywall_hit_at=gte.${range7d_paywall.start}` +
      `&paywall_hit_at=lte.${range7d_paywall.end}` +
      `&subscription_tier=eq.free`
    );
    for (const profile of (paywallProfiles7 || [])) {
      try {
        const firstName = (profile.full_name || '').split(' ')[0] || 'there';
        const sent = await sendEmail('paywall_followup_7d', { firstName, email: profile.email });
        if (sent) results_p7.sent++;
      } catch (err) {
        results_p7.errors++;
        console.warn('[cron-win-back] paywall_followup_7d error:', profile.id, err?.message);
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

  // Also drive the cadence step runner in the same invocation (Hobby plan
  // caps us to daily crons + 12 functions, so we piggy-back on this one).
  try {
    results.cadence = await runCadenceBatch();
  } catch (err) {
    console.error('[cron-win-back] Cadence runner error:', err?.message || err);
    results.cadence = { error: err?.message || String(err) };
  }

  // Phase D: drain scheduled content_calendar items (facebook + instagram
  // wired today; other platforms skip gracefully until tokens land).
  try {
    results.publish = await runPublishBatch();
  } catch (err) {
    console.error('[cron-win-back] Publish runner error:', err?.message || err);
    results.publish = { error: err?.message || String(err) };
  }

  // Phase F: growth engine — runs every day
  try { results.lead_scoring = await runLeadScoringBatch(500); }
  catch (err) { results.lead_scoring = { error: err?.message || String(err) }; }

  try { results.metrics = await runMetricsFetch(30); }
  catch (err) { results.metrics = { error: err?.message || String(err) }; }

  try { results.ab_rotation = await runVariantRotation(); }
  catch (err) { results.ab_rotation = { error: err?.message || String(err) }; }

  // Weekly digest — only on Mondays (UTC)
  const todayDow = new Date().getUTCDay();
  if (todayDow === 1) {
    try {
      const digestEmail = process.env.DIGEST_EMAIL || '';
      results.weekly_digest = await runWeeklyDigest(digestEmail);
    } catch (err) {
      results.weekly_digest = { error: err?.message || String(err) };
    }
  }

  console.log('[cron-win-back] Completed:', results);
  return json(res, 200, { ok: true, results });
};
