/**
 * SmartSwing AI — Email webhook visibility stats
 *
 * Aggregates the `email_events` table (populated by api/resend-webhook.js)
 * into the delivery/open/click/bounce rates the marketing dashboard shows.
 * Roadmap item #3 (2026-04-15 plan) — gives operators a "is the webhook
 * actually firing" signal without asking them to open the Resend console.
 *
 *   GET /api/email-webhook-stats?days=30
 *     → { windowDays, totals: { delivered, opened, clicked, bounced, complained },
 *         rates: { open, click, bounce }, healthy, lastEventAt }
 *
 * Rates are percentages (0-100) rounded to 1 decimal.
 * `healthy` is true when we've seen at least one event in the last 48h —
 *   a flag the UI uses to flip the "webhook not receiving events" banner.
 */

'use strict';

const { sendError, sendSuccess, methodNotAllowed } = require('./_lib/http-responses.js');

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return sendError(res, 503, 'Supabase not configured', { code: 'CONFIG_MISSING' });
  }

  const daysParam = parseInt(req.query && req.query.days, 10);
  const days = Number.isFinite(daysParam) ? Math.min(MAX_DAYS, Math.max(1, daysParam)) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Count events by type in the window. PostgREST gives us a grouping
    // via the Prefer header; we do the GROUP BY ourselves with a raw RPC
    // call, then aggregate in JS.
    const url = `${supabaseUrl}/rest/v1/email_events?select=event_type,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=50000`;
    const resp = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return sendError(res, 502, `email_events query failed: ${resp.status} ${txt.slice(0, 160)}`);
    }
    const rows = await resp.json();

    const totals = { delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, sent: 0 };
    let lastEventAt = null;
    for (const row of rows) {
      const t = (row.event_type || '').toLowerCase();
      // Normalise Resend's event naming (email.delivered / email.opened / …)
      // into the flat counters the UI expects.
      if (t.endsWith('.delivered'))  totals.delivered++;
      if (t.endsWith('.opened'))     totals.opened++;
      if (t.endsWith('.clicked'))    totals.clicked++;
      if (t.endsWith('.bounced'))    totals.bounced++;
      if (t.endsWith('.complained')) totals.complained++;
      if (t.endsWith('.sent'))       totals.sent++;
      if (!lastEventAt || row.created_at > lastEventAt) lastEventAt = row.created_at;
    }

    // Rates expressed as % of DELIVERED (industry convention). Fall back to
    // % of SENT if delivered is zero; fall back to 0 if sent is also zero.
    const base = totals.delivered || totals.sent || 0;
    const pct = (n) => base > 0 ? Math.round((n / base) * 1000) / 10 : 0;
    const rates = {
      open:   pct(totals.opened),
      click:  pct(totals.clicked),
      bounce: pct(totals.bounced)
    };

    const healthy = !!lastEventAt && (Date.now() - new Date(lastEventAt).getTime()) < 48 * 60 * 60 * 1000;

    return sendSuccess(res, 200, {
      windowDays: days,
      totals,
      rates,
      lastEventAt,
      healthy,
      eventCount: rows.length
    });
  } catch (err) {
    return sendError(res, 500, err.message || 'Internal error');
  }
};
