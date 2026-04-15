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
    const fetchRes = await fetch(sourceUrl);
    if (!fetchRes.ok) {
      console.warn(`[media-storage] Source fetch failed (${fetchRes.status}):`, sourceUrl);
      return null;
    }
    const bytes = Buffer.from(await fetchRes.arrayBuffer());

    const uploadRes = await fetch(`${supaBase()}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        ...supaHeaders(),
        'Content-Type': opts.contentType || 'image/png',
        'x-upsert': 'true'
      },
      body: bytes
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text().catch(() => '');
      console.warn(`[media-storage] Upload failed (${uploadRes.status}):`, txt.slice(0, 200));
      return null;
    }

    // Public URL — bucket is public so no signing needed
    return `${supaBase()}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch (err) {
    console.warn('[media-storage] uploadFromUrl error:', err?.message || err);
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
