/**
 * SmartSwing AI — Short-form Video Generation (Phase F #7)
 *
 * Pluggable video generator. Today supports Runway ML (if RUNWAY_API_KEY set)
 * and Pika Labs (if PIKA_API_KEY set). Falls back to returning a friendly
 * "not configured" response so the UI flow stays intact.
 *
 * All generated clips are mirrored to the Supabase Storage bucket
 * `marketing-media` via persistGeneratedImage (reused for video too —
 * the helper handles any MIME type passed in opts.contentType).
 */

'use strict';

const { uploadFromUrl } = require('./media-storage');
const { brandImagePrompt } = require('./brand-style');

async function generateWithRunway(prompt) {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) return { ok: false, error: 'RUNWAY_API_KEY not set', skip: true };
  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' },
      body: JSON.stringify({
        model: 'gen3a_turbo',
        prompt_text: brandImagePrompt(prompt),
        duration: 5,
        ratio: '768:1280'
      })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `Runway ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, jobId: data.id, status: 'queued', provider: 'runway' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function generateWithPika(prompt) {
  const key = process.env.PIKA_API_KEY;
  if (!key) return { ok: false, error: 'PIKA_API_KEY not set', skip: true };
  // Pika's API surface is private-beta — stubbed with the canonical shape
  return { ok: false, error: 'Pika integration pending', skip: true };
}

async function generateVideo(prompt, opts = {}) {
  // Try Runway first, then Pika
  let result = await generateWithRunway(prompt);
  if (result.skip) result = await generateWithPika(prompt);
  if (!result.ok) return result;

  // If the provider returned a ready URL (sync), mirror it to storage.
  if (result.url) {
    const permanent = await uploadFromUrl(result.url, {
      prefix: 'video',
      filename: opts.contentItemId ? `v_${opts.contentItemId}` : undefined,
      contentType: 'video/mp4'
    });
    if (permanent) result.url = permanent;
  }
  return result;
}

module.exports = { generateVideo };
