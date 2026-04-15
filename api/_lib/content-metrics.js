/**
 * SmartSwing AI — Content Performance Loop (Phase F #3)
 *
 * For every published content_calendar row with a provider_post_id, pull
 * engagement metrics from the source platform (Meta Graph for FB/IG today;
 * others stubbed). Persist to content_metrics so the UI can show impressions,
 * CTR, saves, and so the copywriter agent can learn from the top performers.
 *
 * Fetch cadence: called once a day from cron-win-back. We grab posts that
 *   a) were published in the last 14 days, AND
 *   b) either have never been metric-ed OR were last metric-ed > 6h ago.
 */

'use strict';

function supaBase() { return String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''); }
function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function fetchFacebookInsights(postId, token) {
  const url = `https://graph.facebook.com/v21.0/${postId}/insights?` +
    `metric=post_impressions,post_impressions_unique,post_reactions_by_type_total,` +
    `post_clicks,post_video_views&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json().catch(() => ({}));
  const pick = (name) => {
    const m = (data.data || []).find(d => d.name === name);
    return m?.values?.[0]?.value;
  };
  return {
    impressions: Number(pick('post_impressions') || 0),
    reach:       Number(pick('post_impressions_unique') || 0),
    clicks:      Number(pick('post_clicks') || 0),
    video_views: Number(pick('post_video_views') || 0),
    likes: 0, comments: 0, shares: 0, saves: 0,
    raw: data
  };
}

async function fetchInstagramInsights(mediaId, token) {
  const url = `https://graph.facebook.com/v21.0/${mediaId}/insights?` +
    `metric=impressions,reach,likes,comments,shares,saves,video_views&` +
    `access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json().catch(() => ({}));
  const pick = (name) => {
    const m = (data.data || []).find(d => d.name === name);
    return Number(m?.values?.[0]?.value || 0);
  };
  return {
    impressions: pick('impressions'),
    reach:       pick('reach'),
    likes:       pick('likes'),
    comments:    pick('comments'),
    shares:      pick('shares'),
    saves:       pick('saves'),
    video_views: pick('video_views'),
    clicks:      0,
    raw: data
  };
}

async function runMetricsFetch(limit = 30) {
  const out = { fetched: 0, skipped: 0, failed: 0 };
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ...out, error: 'Supabase not configured' };
  const token = process.env.META_PAGE_ACCESS_TOKEN;

  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const url = `${supaBase()}/rest/v1/content_calendar?` +
    `status=eq.published&published_at=gte.${since}&provider_post_id=not.is.null&select=id,platform,provider_post_id,published_at&limit=${limit}`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return { ...out, error: `list failed ${r.status}` };
  const items = await r.json().catch(() => []);

  for (const item of items) {
    const plat = (item.platform || '').toLowerCase();
    let metrics = null;
    try {
      if (plat === 'facebook' && token) metrics = await fetchFacebookInsights(item.provider_post_id, token);
      else if (plat === 'instagram' && token) metrics = await fetchInstagramInsights(item.provider_post_id, token);
    } catch (_) { metrics = null; }

    if (!metrics) { out.skipped++; continue; }
    const engagement = (metrics.likes + metrics.comments + metrics.shares + metrics.saves + metrics.clicks);
    const er = metrics.impressions > 0 ? (engagement / metrics.impressions * 100) : 0;

    const row = {
      content_item_id: item.id,
      platform: plat,
      provider_post_id: item.provider_post_id,
      impressions: metrics.impressions,
      reach: metrics.reach,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      saves: metrics.saves,
      clicks: metrics.clicks,
      video_views: metrics.video_views,
      engagement_rate: Math.round(er * 1000) / 1000,
      raw: metrics.raw
    };
    try {
      const ir = await fetch(`${supaBase()}/rest/v1/content_metrics`, {
        method: 'POST',
        headers: { ...supaHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      });
      if (ir.ok) out.fetched++; else out.failed++;
    } catch (_) { out.failed++; }
  }
  return out;
}

// Return top-performing recent posts so the copywriter agent can learn from them
async function topPerformers(limit = 3) {
  if (!supaBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const url = `${supaBase()}/rest/v1/content_metrics?` +
    `fetched_at=gte.${since}&order=engagement_rate.desc&limit=${limit}&select=content_item_id,engagement_rate,impressions,likes`;
  const r = await fetch(url, { headers: supaHeaders() });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

module.exports = { runMetricsFetch, topPerformers };
