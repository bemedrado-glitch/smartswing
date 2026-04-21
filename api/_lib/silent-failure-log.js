/**
 * SmartSwing AI — Dead-letter logger for previously-silent failures (S6).
 *
 * Context: audit flagged 17+ `try { ... } catch (err) { console.warn(...); }`
 * sites across api/*.js that lose data on Supabase hiccups. The cron runner
 * keeps humming along but you only find out via bounced emails or missing
 * prospects weeks later.
 *
 * This helper:
 *   1. Keeps the existing console.warn so Vercel Logs still show it
 *   2. Also writes a row to `api_error_log` (Supabase) so operators can
 *      query / triage / mark resolved from a dashboard
 *   3. Is fire-and-forget — never throws, never blocks the caller's
 *      success path even if the error log itself fails
 *   4. Captures arbitrary metadata JSONB for context (contact id, email,
 *      URL, etc.) so you can reproduce the problem
 *
 * Usage:
 *   const { logSilentFailure } = require('./silent-failure-log');
 *   try { await riskyThing(); }
 *   catch (err) {
 *     logSilentFailure('persistAgentOutput', err, { agent_id, user_id });
 *   }
 */

function _supaHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  };
}

/**
 * Fire-and-forget log of a silent failure.
 *
 * @param {string} source - logical source identifier (function name / route)
 * @param {Error|string} err - the error that would otherwise have been swallowed
 * @param {object=} metadata - arbitrary context (ids, emails, urls, etc.)
 * @param {('info'|'warn'|'error'|'critical')=} severity - default 'warn'
 */
function logSilentFailure(source, err, metadata = {}, severity = 'warn') {
  const msg = err && err.message ? err.message : String(err || 'unknown error');
  const code = err && err.code ? String(err.code) : null;

  // Always log to stdout so Vercel Logs retain the breadcrumb even if the
  // dead-letter write below fails.
  try { console.warn(`[${source}] ${severity.toUpperCase()}:`, msg, metadata); } catch (_) {}

  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return; // can't log — don't crash the caller

  // Fire-and-forget write. We don't await this; the caller has already
  // decided the error is non-fatal. If the log fails we've at least got
  // console.warn above.
  const payload = {
    source: String(source).slice(0, 120),
    severity,
    error_message: msg.slice(0, 2000),
    error_code: code ? code.slice(0, 60) : null,
    metadata: metadata && typeof metadata === 'object' ? metadata : { raw: String(metadata) }
  };

  fetch(`${url}/rest/v1/api_error_log`, {
    method: 'POST',
    headers: _supaHeaders(key),
    body: JSON.stringify(payload)
  }).catch(() => { /* last-resort — nothing more we can do */ });
}

module.exports = { logSilentFailure };
