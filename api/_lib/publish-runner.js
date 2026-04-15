/**
 * SmartSwing AI — Content Publish Runner (Phase D)
 *
 * Drains `content_calendar` rows that are due to be posted:
 *   status = 'scheduled'
 *   scheduled_date <= today
 *   (scheduled_time IS NULL OR scheduled_time <= now-local)
 *   approval_status IN ('approved', NULL)  (safety gate)
 *
 * For each eligible item:
 *   1. Route to the platform-specific publisher (Facebook / Instagram today;
 *      X / YouTube / TikTok / Reddit wired when their tokens land).
 *   2. On success: PATCH status='published', posted_url, provider_post_id,
 *      published_at = now().
 *   3. On failure: PATCH failure_reason. Keep status='scheduled' so the next
 *      tick retries (unless failure_reason counts >= 3, then move to 'failed').
 *
 * Exposed as:
 *   runPublishBatch()      — invoked by cron-win-back + /api/marketing/publish-run
 *   publishSingleItem(id)  — invoked by /api/marketing/publish-now (manual)
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   META_PAGE_ACCESS_TOKEN, META_PAGE_ID, META_IG_ACCOUNT_ID  (optional)
 *
 * Supported platforms: facebook, instagram, tiktok, youtube, x/twitter, reddit
 */

'use strict';

const { formatForPlatform } = require('./platform-formatter');
const { wrapLinksWithUtm } = (() => { try { return require('./link-shortener'); } catch (_) { return { wrapLinksWithUtm: (s) => s }; } })();

function supaBase() {
  return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowHHMM() { return new Date().toTimeString().slice(0, 5); }

// ── Platform publishers ─────────────────────────────────────────────────────

// Finalize the caption that gets sent to each platform. Combines platform rules,
// persona-aware hashtags, UTM link-wrap, and the item's copy_text/title.
function buildCaption(platform, item) {
  const formatted = formatForPlatform(platform, item);
  let caption = formatted.caption || '';
  if (formatted.hashtags?.length) caption += (caption.endsWith('\n') ? '' : '\n\n') + formatted.hashtags.join(' ');
  caption = wrapLinksWithUtm(caption, { platform, item });
  return { caption, formatted };
}

async function publishFacebook(item) {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID || '724180587440946';
  if (!accessToken) return { ok: false, error: 'META_PAGE_ACCESS_TOKEN not configured' };

  const { caption } = buildCaption('facebook', item);

  // Native photo post beats link-preview for reach.
  if (item.image_url) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: item.image_url, caption, access_token: accessToken })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !(data.post_id || data.id)) return { ok: false, error: data?.error?.message || `FB photo error ${r.status}` };
    const postId = data.post_id || data.id;
    return { ok: true, providerId: postId, url: `https://facebook.com/${postId}` };
  }

  // Text-only fallback
  const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: caption, access_token: accessToken })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id) return { ok: false, error: data?.error?.message || `FB error ${r.status}` };
  return { ok: true, providerId: data.id, url: `https://facebook.com/${data.id}` };
}

async function publishInstagram(item) {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const igId = process.env.META_IG_ACCOUNT_ID || '17841475762518145';
  if (!accessToken) return { ok: false, error: 'META_PAGE_ACCESS_TOKEN not configured' };
  if (!item.image_url && !item.video_url) return { ok: false, error: 'Instagram requires image_url or video_url' };

  const { caption } = buildCaption('instagram', item);

  // Reels branch if video_url present
  const isReel = !!item.video_url;
  const mediaBody = isReel
    ? { media_type: 'REELS', video_url: item.video_url, caption, access_token: accessToken }
    : { image_url: item.image_url, caption, access_token: accessToken };

  // 1) Create media container
  const cRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mediaBody)
  });
  const c = await cRes.json().catch(() => ({}));
  if (!c.id) return { ok: false, error: c?.error?.message || 'IG container failed' };

  // 2) For Reels, poll container until FINISHED (max ~30s)
  if (isReel) {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await fetch(`https://graph.facebook.com/v21.0/${c.id}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`);
      const sd = await s.json().catch(() => ({}));
      if (sd.status_code === 'FINISHED') break;
      if (sd.status_code === 'ERROR') return { ok: false, error: 'IG Reel encoding failed' };
    }
  }

  // 3) Publish it
  const pRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: c.id, access_token: accessToken })
  });
  const p = await pRes.json().catch(() => ({}));
  if (!p.id) return { ok: false, error: p?.error?.message || 'IG publish failed' };
  return { ok: true, providerId: p.id, url: `https://instagram.com/p/${p.id}` };
}

// Placeholder publishers — wired when tokens land
async function publishNotImplemented(platform) {
  return { ok: false, error: `${platform} publisher not yet configured`, skip: true };
}

const PUBLISHERS = {
  facebook:  publishFacebook,
  instagram: publishInstagram,
  tiktok:    (it) => publishNotImplemented('tiktok'),
  youtube:   (it) => publishNotImplemented('youtube'),
  x:         (it) => publishNotImplemented('x'),
  twitter:   (it) => publishNotImplemented('x'),
  reddit:    (it) => publishNotImplemented('reddit'),
  blog:      (it) => publishNotImplemented('blog'),
  email:     (it) => publishNotImplemented('email')
};

// ── DB helpers ──────────────────────────────────────────────────────────────

async function patchItem(id, patch) {
  const url = `${supaBase()}/rest/v1/content_calendar?id=eq.${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...supaHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
  return r.ok;
}

async function fetchItem(id) {
  const url = `${supaBase()}/rest/v1/content_calendar?id=eq.${encodeURIComponent(id)}&select=*`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function fetchDueItems(limit = 25) {
  const t = todayISO();
  // status='scheduled', scheduled_date <= today
  // approval_status IN ('approved', null)  -> use `or=(approval_status.eq.approved,approval_status.is.null)`
  const q = [
    `status=eq.scheduled`,
    `scheduled_date=lte.${t}`,
    `or=(approval_status.eq.approved,approval_status.is.null)`,
    `order=scheduled_date.asc,scheduled_time.asc.nullsfirst`,
    `limit=${limit}`,
    `select=*`
  ].join('&');
  const url = `${supaBase()}/rest/v1/content_calendar?${q}`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`fetchDueItems ${r.status}: ${txt.slice(0, 200)}`);
  }
  const rows = await r.json().catch(() => []);
  const now = nowHHMM();
  // client-side time-of-day gate (scheduled_time NULL means "any time today is fine")
  return rows.filter(row => {
    if (row.scheduled_date < t) return true;
    if (!row.scheduled_time) return true;
    return String(row.scheduled_time).slice(0, 5) <= now;
  });
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function publishSingleItem(id) {
  const item = await fetchItem(id);
  if (!item) return { ok: false, error: 'Item not found' };

  const platform = String(item.platform || '').toLowerCase().trim();
  const pub = PUBLISHERS[platform];
  if (!pub) {
    await patchItem(id, { failure_reason: `Unknown platform: ${platform}` });
    return { ok: false, error: `Unknown platform: ${platform}` };
  }

  let result;
  try {
    result = await pub(item);
  } catch (err) {
    result = { ok: false, error: err?.message || String(err) };
  }

  if (result.ok) {
    await patchItem(id, {
      status: 'published',
      posted_url: result.url || null,
      provider_post_id: result.providerId || null,
      published_at: nowISO(),
      failure_reason: null
    });
    return { ok: true, id, providerId: result.providerId, url: result.url };
  } else {
    await patchItem(id, { failure_reason: (result.error || 'Publish failed').slice(0, 500) });
    return { ok: false, id, error: result.error, skip: !!result.skip };
  }
}

async function runPublishBatch() {
  const out = { checked: 0, published: 0, skipped: 0, failed: 0, details: [] };
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ...out, error: 'Supabase not configured' };
  }

  let items;
  try {
    items = await fetchDueItems(25);
  } catch (err) {
    return { ...out, error: err?.message || String(err) };
  }
  out.checked = items.length;
  if (!items.length) return out;

  for (const item of items) {
    const r = await publishSingleItem(item.id);
    if (r.ok) { out.published++; out.details.push({ id: item.id, status: 'published', url: r.url }); }
    else if (r.skip) { out.skipped++; out.details.push({ id: item.id, status: 'skipped', reason: r.error }); }
    else { out.failed++; out.details.push({ id: item.id, status: 'failed', reason: r.error }); }
  }
  return out;
}

module.exports = { runPublishBatch, publishSingleItem, fetchDueItems };
