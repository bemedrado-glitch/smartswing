/**
 * HTTP fetch wrapper — adds timeout, polite UA, rate limit, retries.
 * Used by every federation source so we never accidentally DDoS a
 * federation server (most are small national orgs running on shared
 * hosting).
 */
'use strict';

const DEFAULT_UA =
  'SmartSwingAI-LeadHarvester/1.0 (+https://www.smartswingai.com/contact.html; b2b directory mirror; respect robots.txt)';

const MIN_GAP_MS = 800;          // rate limit floor between requests to same host
const _lastHit = new Map();      // host -> timestamp

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function _politeWait(host) {
  const now = Date.now();
  const prev = _lastHit.get(host) || 0;
  const wait = MIN_GAP_MS - (now - prev);
  if (wait > 0) await _sleep(wait);
  _lastHit.set(host, Date.now());
}

async function fetchText(url, opts = {}) {
  const { timeoutMs = 15000, ua = DEFAULT_UA, retries = 2 } = opts;
  const host = new URL(url).host;
  await _politeWait(host);

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': ua, 'Accept': 'text/html,application/json,*/*' }
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await _sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await _sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function fetchJson(url, opts = {}) {
  const txt = await fetchText(url, opts);
  return JSON.parse(txt);
}

module.exports = { fetchText, fetchJson };
