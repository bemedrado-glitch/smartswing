/**
 * SmartSwing AI — Short Link Redirector (Ticket #9)
 *
 * Handles GET /go/:code → 302 redirect to the stored target_url while logging
 * the click against content_metrics + short_link_clicks for attribution.
 *
 * Route must be wired in vercel.json:
 *   { "source": "/go/:code", "destination": "/api/go?code=:code" }
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
'use strict';

function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function supaBase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://x.invalid');
  const code = (url.searchParams.get('code') || req.query?.code || '').slice(0, 16);
  const utmSource   = url.searchParams.get('utm_source') || null;
  const utmCampaign = url.searchParams.get('utm_campaign') || null;
  const utmContent  = url.searchParams.get('utm_content') || null;

  if (!code || !/^[a-z0-9]{3,16}$/i.test(code)) {
    res.statusCode = 404;
    return res.end('Not Found');
  }

  // Look up destination
  let target = 'https://smartswingai.com/';
  try {
    const r = await fetch(`${supaBase()}/rest/v1/short_links?code=eq.${encodeURIComponent(code)}&select=target_url&limit=1`, {
      headers: supaHeaders()
    });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      if (rows[0]?.target_url) target = rows[0].target_url;
    }
  } catch (_) { /* fall through to default */ }

  // Log click (fire-and-forget)
  try {
    fetch(`${supaBase()}/rest/v1/short_link_clicks`, {
      method: 'POST',
      headers: { ...supaHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        code,
        clicked_at: new Date().toISOString(),
        user_agent: (req.headers['user-agent'] || '').slice(0, 500),
        referrer: (req.headers.referer || '').slice(0, 500),
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        utm_content: utmContent
      })
    }).catch(() => {});
  } catch (_) { /* non-fatal */ }

  // If we can parse utmContent as a content_item UUID, increment its click count
  if (utmContent) {
    try {
      fetch(`${supaBase()}/rest/v1/rpc/increment_content_clicks`, {
        method: 'POST',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ item_id: utmContent })
      }).catch(() => {});
    } catch (_) {}
  }

  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};
