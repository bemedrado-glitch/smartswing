/**
 * SmartSwing AI — Lead Scoring (Phase F #1)
 *
 * Computes a 0-100 score for each marketing_contacts row from the signals
 * we already collect. Higher score = hotter lead. Sort your Leads tab by
 * this and your top 20 are always the ones to call today.
 *
 * Signals (all additive, capped at 100):
 *   contactable (has email AND phone) ........... +20
 *   has email only .............................. +10
 *   has phone only .............................. +10
 *   club with website ........................... +10
 *   club size signal (>=5 courts or academy) .... +15
 *   player ranked <500 .......................... +25
 *   opened any cadence email .................... +10
 *   clicked any cadence link .................... +20
 *   replied ..................................... +40
 *   visited pricing page (utm_source=pricing) ... +30
 *   time decay: -5 if last_contacted_at > 60d ago
 */

'use strict';

function supaBase() { return String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''); }
function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function scoreContact(c, engagement = {}) {
  let score = 0;
  const hasEmail = !!(c.email && c.email.trim() && !/pending-enrichment/i.test(c.email));
  const hasPhone = !!(c.phone && c.phone.trim());

  if (hasEmail && hasPhone) score += 20;
  else if (hasEmail) score += 10;
  else if (hasPhone) score += 10;

  if (c.type === 'club' || c.contact_type === 'club') {
    if (c.website) score += 10;
    const sizeHint = String(c.description || c.notes || '').toLowerCase();
    if (/(\d{1,2})\s*courts?/.test(sizeHint)) {
      const n = parseInt(sizeHint.match(/(\d{1,2})\s*courts?/)[1], 10);
      if (n >= 5) score += 15;
    }
    if (/academy|high[\s-]?performance|college|university/i.test(sizeHint)) score += 15;
  }

  if (c.type === 'player' || c.contact_type === 'player') {
    const rank = Number(c.ranking_position || c.player_rank || 0);
    if (rank > 0 && rank < 500) score += 25;
    else if (rank > 0 && rank < 2000) score += 10;
  }

  if (engagement.opened) score += 10;
  if (engagement.clicked) score += 20;
  if (c.replied_at) score += 40;

  if (c.utm_source === 'pricing' || c.utm_campaign === 'pricing') score += 30;
  if (c.utm_campaign) score += 5;

  // Time decay
  if (c.last_contacted_at) {
    const days = (Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000;
    if (days > 60) score -= 5;
    if (days > 120) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

async function runLeadScoringBatch(limit = 500) {
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { scored: 0, error: 'Supabase not configured' };
  }
  const out = { scored: 0, errors: 0 };

  // Pull contacts that need scoring (never scored OR scored >24h ago)
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const url = `${supaBase()}/rest/v1/marketing_contacts?` +
    `select=*&or=(last_scored_at.is.null,last_scored_at.lt.${cutoff})` +
    `&limit=${limit}`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return { ...out, error: `fetch failed ${r.status}` };
  const contacts = await r.json().catch(() => []);
  if (!contacts.length) return out;

  // Pull engagement signals in one go (email_events grouped by email)
  const eventsUrl = `${supaBase()}/rest/v1/email_events?select=email,event_type`;
  let engagementMap = {};
  try {
    const er = await fetch(eventsUrl, { headers: supaHeaders() });
    if (er.ok) {
      const events = await er.json().catch(() => []);
      for (const ev of events) {
        if (!ev.email) continue;
        const k = ev.email.toLowerCase();
        engagementMap[k] = engagementMap[k] || {};
        if (ev.event_type === 'email_opened') engagementMap[k].opened = true;
        if (ev.event_type === 'email_clicked') engagementMap[k].clicked = true;
      }
    }
  } catch (_) { /* non-fatal */ }

  for (const c of contacts) {
    try {
      const eng = engagementMap[(c.email || '').toLowerCase()] || {};
      const score = scoreContact(c, eng);
      const patch = { lead_score: score, last_scored_at: new Date().toISOString() };
      const pr = await fetch(
        `${supaBase()}/rest/v1/marketing_contacts?id=eq.${c.id}`,
        { method: 'PATCH', headers: { ...supaHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(patch) }
      );
      if (pr.ok) out.scored++;
      else out.errors++;
    } catch (_) { out.errors++; }
  }

  return out;
}

module.exports = { scoreContact, runLeadScoringBatch };
