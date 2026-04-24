/**
 * SmartSwing AI — Google Search Console read-only endpoint (stub)
 *
 * Roadmap item #2 (2026-04-15 plan): wire the marketing dashboard's
 * Search Console panel to the actual GSC API instead of placeholder
 * zeros.
 *
 * This file ships as a routable STUB. It:
 *   - Returns 503 with a clear, actionable hint when GSC env vars
 *     aren't configured (status today on most environments).
 *   - When GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL are set, calls
 *     Google's Search Console API to pull last-N-days impressions,
 *     clicks, CTR, avg position, top queries, top pages.
 *
 * Keeping the stub + full-fetch branches in one file means the
 * marketing.html Search Console tiles can call this endpoint today
 * and get a well-formed 503 with setup instructions — no dead tiles,
 * no 404s, no frontend branching. The moment the env vars flip on,
 * the tiles light up automatically.
 *
 * GSC_SERVICE_ACCOUNT_JSON: the full JSON keyfile content, stringified
 *   (not a file path). Paste directly into Vercel env vars.
 * GSC_SITE_URL: the verified Search Console property URL, e.g.
 *   'https://www.smartswingai.com/' (include trailing slash) or
 *   'sc-domain:smartswingai.com' for domain properties.
 *
 *   GET /api/search-console?days=30
 *     → { windowDays, totals: { impressions, clicks, ctr, position },
 *         topQueries: [{query, clicks, impressions, ctr, position}, ...],
 *         topPages:   [{page,  clicks, impressions, ctr, position}, ...] }
 *
 * Quota: 1200 requests/day on the free tier — more than enough for
 * a single dashboard that refreshes on demand. We don't cache here;
 * add edge caching in Vercel later if volume grows.
 */

'use strict';

const { sendError, sendSuccess, methodNotAllowed } = require('./_lib/http-responses.js');

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const saJson  = process.env.GSC_SERVICE_ACCOUNT_JSON;
  const siteUrl = process.env.GSC_SITE_URL;

  if (!saJson || !siteUrl) {
    return sendError(res, 503, 'Search Console not configured', {
      code: 'CONFIG_MISSING',
      hint: 'Set GSC_SERVICE_ACCOUNT_JSON (full keyfile contents) and GSC_SITE_URL in Vercel env. Verify your property in Search Console, then add the service account email as a user on that property.',
      details: {
        missing: [
          !saJson  ? 'GSC_SERVICE_ACCOUNT_JSON' : null,
          !siteUrl ? 'GSC_SITE_URL'              : null
        ].filter(Boolean),
        setup_steps: [
          '1. Create a service account in Google Cloud Console (any project).',
          '2. Generate a JSON key, paste the full contents into GSC_SERVICE_ACCOUNT_JSON.',
          '3. Open Search Console → Settings → Users and permissions → add the service account email with "Restricted" access.',
          '4. Set GSC_SITE_URL to your verified property (include trailing slash).'
        ]
      }
    });
  }

  const daysParam = parseInt(req.query && req.query.days, 10);
  const days = Number.isFinite(daysParam) ? Math.min(MAX_DAYS, Math.max(1, daysParam)) : DEFAULT_DAYS;
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const sa = JSON.parse(saJson);
    const token = await getAccessToken(sa);
    if (!token) return sendError(res, 502, 'Could not mint a Google access token — check GSC_SERVICE_ACCOUNT_JSON.');

    const [agg, queries, pages] = await Promise.all([
      queryGSC(token, siteUrl, { startDate, endDate, dimensions: [], rowLimit: 1 }),
      queryGSC(token, siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: 10 }),
      queryGSC(token, siteUrl, { startDate, endDate, dimensions: ['page'],  rowLimit: 10 })
    ]);

    const aggRow = (agg.rows && agg.rows[0]) || { impressions: 0, clicks: 0, ctr: 0, position: 0 };
    const totals = {
      impressions: aggRow.impressions || 0,
      clicks:      aggRow.clicks      || 0,
      ctr:         Math.round((aggRow.ctr || 0) * 10000) / 100, // 0..100 %
      position:    Math.round((aggRow.position || 0) * 10) / 10
    };
    const shape = (rowList, dimKey) =>
      (rowList.rows || []).map(r => ({
        [dimKey]:    (r.keys && r.keys[0]) || '',
        clicks:      r.clicks || 0,
        impressions: r.impressions || 0,
        ctr:         Math.round((r.ctr || 0) * 10000) / 100,
        position:    Math.round((r.position || 0) * 10) / 10
      }));

    return sendSuccess(res, 200, {
      windowDays: days,
      siteUrl,
      totals,
      topQueries: shape(queries, 'query'),
      topPages:   shape(pages,   'page')
    });
  } catch (err) {
    return sendError(res, 500, err.message || 'Internal error');
  }
};

/**
 * Mint a Google access token from a service-account JSON using the
 * googleapi / JWT grant flow. Avoids the googleapis npm dep — it's a
 * single self-signed JWT POST.
 *
 * Returns the access_token string, or null on auth failure.
 */
async function getAccessToken(sa) {
  const crypto = require('crypto');
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const b64url = (s) => Buffer.from(s).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(sa.private_key).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${signingInput}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(jwt)}`
  });
  if (!resp.ok) return null;
  const j = await resp.json();
  return j.access_token || null;
}

async function queryGSC(token, siteUrl, { startDate, endDate, dimensions, rowLimit }) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit })
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`GSC API error ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return await resp.json();
}
