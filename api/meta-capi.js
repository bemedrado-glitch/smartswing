/**
 * SmartSwing AI — Meta Conversions API (CAPI) server-side event bridge
 *
 * iOS 14.5+ and the ongoing browser-privacy clampdown silently drops
 * 20-30% of browser-fired Meta Pixel events. CAPI is Meta's backstop:
 * the same event, sent server-side with first-party data, deduplicated
 * against the browser event via a shared `event_id`. Matching rates
 * typically recover to 95%+ compared to browser-only.
 *
 *   POST /api/meta-capi
 *   Body: {
 *     event_name: 'PageView' | 'ViewContent' | 'Lead' | 'InitiateCheckout' |
 *                 'Purchase' | 'AddToCart' | 'CompleteRegistration' | string,
 *     event_id:   string,     // same UUID the browser fired; required for dedup
 *     event_source_url?: string,
 *     user_data?: {
 *       email?: string,       // hashed SHA-256 server-side before send
 *       phone?: string,
 *       external_id?: string, // e.g. Supabase user id
 *       client_ip?: string,   // auto-filled from req
 *       client_user_agent?: string
 *     },
 *     custom_data?: {
 *       currency?: string,    // default 'USD'
 *       value?: number,
 *       content_ids?: string[],
 *       content_type?: string,
 *       content_name?: string,
 *       num_items?: number,
 *       [anyOtherKey]: any    // free-form — Meta ignores unknown keys
 *     }
 *   }
 *
 * Required env vars:
 *   META_PIXEL_ID              (already set for the browser pixel)
 *   META_CAPI_ACCESS_TOKEN     (generate in Events Manager → Settings →
 *                               "Generate access token" under Conversions API)
 *
 * Optional:
 *   META_CAPI_TEST_EVENT_CODE  (during QA; remove in prod)
 *
 * Deduplication: always include the same `event_id` the browser pixel
 * fires. When both sides arrive within 48h with the same id, Meta
 * counts it once. Without dedup, conversions double-count, which
 * breaks attribution models.
 */

'use strict';

const crypto = require('crypto');
const { sendError, sendSuccess, methodNotAllowed } = require('./_lib/http-responses.js');

const GRAPH_API_VERSION = 'v19.0';

/**
 * Normalise + SHA-256 hash a PII value per Meta's CAPI requirements.
 * - Lowercase + trim for email / name
 * - Strip non-digits for phone (keep country code digits only)
 * - Already-hashed strings (64-char hex) pass through unchanged
 */
function hashPII(value, kind) {
  if (!value) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  // Already looks hashed (SHA-256 hex = 64 chars, all hex)
  if (/^[a-f0-9]{64}$/i.test(s)) return s.toLowerCase();
  let normalised;
  if (kind === 'phone') {
    normalised = s.replace(/[^\d]/g, '');
    if (!normalised) return undefined;
  } else {
    normalised = s.toLowerCase();
  }
  return crypto.createHash('sha256').update(normalised).digest('hex');
}

// Client IP extraction — Vercel / Cloudflare / general reverse-proxy aware.
function extractClientIp(req) {
  const hdr = req.headers || {};
  const fwd = hdr['x-forwarded-for'] || hdr['X-Forwarded-For'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return hdr['x-real-ip'] || hdr['X-Real-IP'] || (req.socket && req.socket.remoteAddress) || undefined;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    return sendError(res, 503, 'Meta CAPI not configured', {
      code: 'CONFIG_MISSING',
      hint: 'Set META_PIXEL_ID (already used by the browser pixel) + META_CAPI_ACCESS_TOKEN in Vercel. Generate the access token in Events Manager → your pixel → Settings → "Generate access token" under Conversions API.',
      details: {
        missing: [
          !pixelId     ? 'META_PIXEL_ID'         : null,
          !accessToken ? 'META_CAPI_ACCESS_TOKEN' : null
        ].filter(Boolean)
      }
    });
  }

  const body = req.body || {};
  const eventName = String(body.event_name || '').trim();
  if (!eventName) return sendError(res, 400, 'event_name required', { code: 'INVALID_INPUT' });

  const ud = body.user_data || {};
  const user_data = {
    // Hash PII before it leaves our server — Meta requires this and we
    // never want to send plaintext emails across the wire even once.
    em: hashPII(ud.email, 'email'),
    ph: hashPII(ud.phone, 'phone'),
    external_id: hashPII(ud.external_id, 'id'),
    // IP + UA are NOT hashed — Meta uses them for matching as-is.
    client_ip_address: ud.client_ip || extractClientIp(req),
    client_user_agent: ud.client_user_agent || req.headers['user-agent'] || undefined,
    // Pixel-set click ids (from cookies) improve match quality significantly
    // when present. Callers pass them through from document.cookie _fbc/_fbp.
    fbc: ud.fbc || undefined,
    fbp: ud.fbp || undefined
  };
  // Strip undefined fields so the Meta API doesn't reject a sparse object.
  Object.keys(user_data).forEach((k) => user_data[k] === undefined && delete user_data[k]);

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: body.action_source || 'website',
    // event_source_url must be a full URL for Meta's domain-match checks.
    event_source_url: body.event_source_url || req.headers.referer || undefined,
    // Dedup key — caller MUST pass the same id the browser fires for the
    // same user action; otherwise Meta double-counts.
    event_id: body.event_id || crypto.randomUUID(),
    user_data,
    custom_data: body.custom_data || {}
  };
  if (!event.event_source_url) delete event.event_source_url;

  const payload = {
    data: [event],
    access_token: accessToken
  };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Meta returns 400 with details when validation fails — pass that
      // through so the caller can log the actual reason without re-hashing.
      return sendError(res, 502, 'Meta CAPI error', {
        code: 'META_API_ERROR',
        details: { status: resp.status, response: data }
      });
    }
    return sendSuccess(res, 200, {
      events_received: data.events_received || 1,
      messages: data.messages || [],
      fbtrace_id: data.fbtrace_id || null,
      event_id: event.event_id
    });
  } catch (err) {
    return sendError(res, 500, err.message || 'Network error reaching Meta CAPI');
  }
};

// Expose helpers for tests.
module.exports._internals = { hashPII, extractClientIp };
