/**
 * SmartSwing AI — Media Storage Helper
 *
 * DALL-E returns ephemeral URLs that expire in ~60 minutes. This module
 * downloads the image bytes and re-uploads them to the Supabase Storage
 * bucket `marketing-media`, returning a permanent public URL.
 *
 * Bucket setup (one-time, done via migration):
 *   CREATE BUCKET marketing-media (public, 50MB limit, image/* + video/*)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const BUCKET = 'marketing-media';

function supaHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function supaBase() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('SUPABASE_URL is not configured.');
  return base;
}

/**
 * Downloads bytes from a URL (e.g. DALL-E CDN) and uploads them to Supabase
 * Storage. Returns the permanent public URL.
 *
 * @param {string} sourceUrl - Ephemeral URL to mirror
 * @param {object} opts
 * @param {string} [opts.prefix='content']  - Path prefix inside bucket
 * @param {string} [opts.filename]          - File name (without extension)
 * @param {string} [opts.contentType='image/png']
 * @returns {Promise<string|null>}          - Public URL, or null on failure
 */
async function uploadFromUrl(sourceUrl, opts = {}) {
  if (!sourceUrl) return null;
  const prefix = opts.prefix || 'content';
  const ext = (opts.contentType || 'image/png').split('/')[1] || 'png';
  const filename = (opts.filename || `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    .replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const path = `${prefix}/${filename}.${ext}`;

  try {
    // Download from source (DALL-E blob CDN sometimes 403s without a UA)
    const dlController = new AbortController();
    const dlTimeout = setTimeout(() => dlController.abort(), 20000);
    let fetchRes;
    try {
      fetchRes = await fetch(sourceUrl, {
        signal: dlController.signal,
        headers: {
          'User-Agent': 'SmartSwing-AI/1.0 (media-mirror; +https://smartswingai.com)',
          'Accept': 'image/*,video/*,*/*'
        }
      });
    } finally { clearTimeout(dlTimeout); }

    if (!fetchRes.ok) {
      const body = await fetchRes.text().catch(() => '');
      console.warn(`[media-storage] Source fetch failed (${fetchRes.status}) for ${sourceUrl.slice(0,80)}…:`, body.slice(0, 200));
      return null;
    }
    const bytes = Buffer.from(await fetchRes.arrayBuffer());
    if (!bytes.length) {
      console.warn('[media-storage] Source returned 0 bytes:', sourceUrl.slice(0, 80));
      return null;
    }

    const upController = new AbortController();
    const upTimeout = setTimeout(() => upController.abort(), 15000);
    let uploadRes;
    try {
      uploadRes = await fetch(`${supaBase()}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        signal: upController.signal,
        headers: {
          ...supaHeaders(),
          'Content-Type': opts.contentType || 'image/png',
          'x-upsert': 'true',
          'Cache-Control': 'public, max-age=31536000, immutable'
        },
        body: bytes
      });
    } finally { clearTimeout(upTimeout); }

    if (!uploadRes.ok) {
      const txt = await uploadRes.text().catch(() => '');
      console.warn(`[media-storage] Upload failed (${uploadRes.status}) path=${path} size=${bytes.length}:`, txt.slice(0, 300));
      return null;
    }

    // Public URL — bucket is public so no signing needed
    const publicUrl = `${supaBase()}/storage/v1/object/public/${BUCKET}/${path}`;
    console.log(`[media-storage] ✓ Persisted ${bytes.length} bytes → ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err));
    console.warn(`[media-storage] uploadFromUrl error (${msg}) source=${String(sourceUrl).slice(0,80)}`);
    return null;
  }
}

/**
 * Persists a DALL-E result into Supabase Storage + logs the asset.
 *
 * @param {string} dalleUrl - Ephemeral OpenAI URL
 * @param {object} meta - { contentItemId, prompt, model }
 * @returns {Promise<{url: string|null, assetId: string|null}>}
 */
async function persistGeneratedImage(dalleUrl, meta = {}) {
  const permanent = await uploadFromUrl(dalleUrl, {
    prefix: 'content',
    filename: meta.contentItemId ? `ci_${meta.contentItemId}` : undefined,
    contentType: 'image/png'
  });
  if (!permanent) return { url: null, assetId: null };

  // Best-effort: log to media_assets table (non-fatal if it doesn't exist)
  let assetId = null;
  try {
    const row = {
      storage_url: permanent,
      source_url: dalleUrl,
      model: meta.model || 'dall-e-3',
      prompt: (meta.prompt || '').slice(0, 2000),
      content_item_id: meta.contentItemId || null,
      kind: 'image',
      created_at: new Date().toISOString()
    };
    const res = await fetch(`${supaBase()}/rest/v1/media_assets`, {
      method: 'POST',
      headers: { ...supaHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
    if (res.ok) {
      const data = await res.json().catch(() => []);
      assetId = Array.isArray(data) ? (data[0]?.id || null) : (data?.id || null);
    }
  } catch (_) { /* non-fatal */ }

  return { url: permanent, assetId };
}

module.exports = { uploadFromUrl, persistGeneratedImage, BUCKET };
