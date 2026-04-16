/**
 * SmartSwing AI — Google Search Console read-only endpoint
 *
 * GET /api/search-console?days=30
 *
 * Returns:
 *   { connected: true, impressions, clicks, ctr, position, topQueries[], topPages[] }
 *
 * If Search Console is not configured, returns HTTP 503 with:
 *   { connected: false, message: "Search Console not connected. See Settings → Search Console for setup." }
 *
 * Env vars:
 *   GSC_SERVICE_ACCOUNT_JSON   — service-account JSON key (stringified). Falls back to
 *                                GOOGLE_SERVICE_ACCOUNT_KEY (already used elsewhere in the repo).
 *   GSC_SITE_URL               — the exact site URL as registered in Search Console
 *                                (e.g. "https://www.smartswingai.com/" or "sc-domain:smartswingai.com")
 *                                Falls back to SEARCH_CONSOLE_SITE_URL.
 *
 * Authentication is done with a self-signed service-account JWT via Node's built-in
 * `crypto` module — no external libraries required.
 */

const crypto = require('crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function base64url(input) {
  return Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readServiceAccount() {
  const raw = (process.env.GSC_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function readSiteUrl() {
  return (process.env.GSC_SITE_URL || process.env.SEARCH_CONSOLE_SITE_URL || '').trim();
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const unsigned = base64url(header) + '.' + base64url(claim);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = unsigned + '.' + signature;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error('Google token exchange failed (' + tokenRes.status + '): ' + errText.slice(0, 300));
  }
  const data = await tokenRes.json();
  return data.access_token;
}

async function queryGSC(siteUrl, accessToken, body) {
  const apiUrl = 'https://searchconsole.googleapis.com/webmasters/v3/sites/'
    + encodeURIComponent(siteUrl) + '/searchAnalytics/query';
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('GSC API failed (' + res.status + '): ' + errText.slice(0, 300));
  }
  return res.json();
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'GET only.' });
  }

  const serviceAccount = readServiceAccount();
  const siteUrl = readSiteUrl();

  if (!serviceAccount || !siteUrl) {
    return json(res, 503, {
      connected: false,
      message: 'Search Console not connected. See Settings → Search Console for setup.',
      missing: {
        GSC_SERVICE_ACCOUNT_JSON: !serviceAccount,
        GSC_SITE_URL: !siteUrl
      }
    });
  }

  // Parse ?days=N (default 30, clamp 1..90)
  let days = 30;
  try {
    const url = new URL(req.url, 'http://localhost');
    const q = parseInt(url.searchParams.get('days') || '30', 10);
    if (Number.isFinite(q) && q > 0) days = Math.min(90, Math.max(1, q));
  } catch (_) { /* default */ }

  // Search Console data has ~2-day lag; start from (today - 2 - days)
  const end = new Date();
  end.setDate(end.getDate() - 2);
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  try {
    const accessToken = await getAccessToken(serviceAccount);

    const [overallRes, queriesRes, pagesRes] = await Promise.all([
      queryGSC(siteUrl, accessToken, { startDate, endDate }),
      queryGSC(siteUrl, accessToken, { startDate, endDate, dimensions: ['query'], rowLimit: 10 }),
      queryGSC(siteUrl, accessToken, { startDate, endDate, dimensions: ['page'], rowLimit: 10 })
    ]);

    const totals = (overallRes.rows && overallRes.rows[0]) || {};
    const impressions = totals.impressions || 0;
    const clicks = totals.clicks || 0;
    const ctr = totals.ctr || 0;
    const position = totals.position || 0;

    const topQueries = (queriesRes.rows || []).map(row => ({
      query: row.keys && row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: Math.round((row.position || 0) * 10) / 10
    }));

    const topPages = (pagesRes.rows || []).map(row => ({
      page: row.keys && row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: Math.round((row.position || 0) * 10) / 10
    }));

    return json(res, 200, {
      connected: true,
      siteUrl,
      dateRange: { startDate, endDate, days },
      impressions,
      clicks,
      ctr,
      position: Math.round(position * 10) / 10,
      topQueries,
      topPages
    });
  } catch (err) {
    console.error('[api/search-console] Error:', err && err.message || err);
    return json(res, 500, {
      connected: false,
      error: 'Search Console fetch failed',
      message: (err && err.message) || 'Unknown error'
    });
  }
};
