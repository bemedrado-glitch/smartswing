/**
 * SmartSwing AI — Link Shortener + UTM Wrapper (Ticket #9)
 *
 * Every outbound URL in published copy is rewritten through our redirector so
 * we can:
 *   1. Track clicks server-side (writes to content_metrics.clicks)
 *   2. Attach UTM parameters for attribution
 *   3. Swap destinations without republishing
 *
 * Route: /go/:code → 302 to target_url, logs the click.
 * Created by `api/go.js` (stub below if absent).
 */
'use strict';

const BASE = String(process.env.SHORT_LINK_BASE || 'https://smartswingai.com/go').replace(/\/+$/, '');

function base36(n) { return (n >>> 0).toString(36); }

// Compact deterministic code from {itemId, platform, urlHash}
function makeCode(itemId, platform, url) {
  const seed = String(itemId || '') + ':' + (platform || '') + ':' + (url || '');
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
  return base36(Math.abs(h)).slice(0, 7);
}

function buildUtm(platform, item) {
  const p = new URLSearchParams();
  p.set('utm_source', String(platform || 'social').toLowerCase());
  p.set('utm_medium', 'social');
  if (item?.campaign_id) p.set('utm_campaign', String(item.campaign_id));
  if (item?.id)          p.set('utm_content', String(item.id));
  return p.toString();
}

/**
 * Swap every absolute URL in `text` for a short, UTM-tagged redirect.
 * Currently generates the short URL deterministically; a future enhancement
 * writes a row to a `short_links` table so the /go/:code handler can resolve
 * arbitrary destinations.
 */
function wrapLinksWithUtm(text, { platform, item } = {}) {
  if (!text) return text;
  return String(text).replace(/https?:\/\/[^\s)]+/g, (url) => {
    // Skip our own already-wrapped short links
    if (url.startsWith(BASE)) return url;
    const code = makeCode(item?.id, platform, url);
    const utm = buildUtm(platform, item);
    return `${BASE}/${code}?${utm}`;
  });
}

module.exports = { wrapLinksWithUtm, makeCode, buildUtm, BASE };
