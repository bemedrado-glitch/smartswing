/**
 * SmartSwing AI — Standardized HTTP response helpers (L3 from audit).
 *
 * Previously 50+ handlers in api/marketing.js each returned their own error
 * shape: `{error}` here, `{error, details}` there, `{error, message}`
 * elsewhere, `{error, detail}` (singular, typo) in one place. Clients had
 * to handle multiple envelopes.
 *
 * Canonical shape going forward:
 *   {
 *     error:       string          — human-readable message (always present)
 *     code?:       string          — machine-readable enum (e.g. 'INVALID_INPUT')
 *     details?:    any             — structured context (objects, arrays)
 *     hint?:       string          — actionable remediation in 1-2 sentences
 *     request_id?: string          — trace id for correlating with logs
 *   }
 *
 * Success shape (for completeness):
 *   { success: true, ...payload }
 *
 * Existing handlers are left alone to avoid regression risk — new code
 * should use these helpers. Incremental migration recommended.
 */

'use strict';

/**
 * Sends a JSON error response with the canonical shape.
 *
 * @param {object} res - Node http.ServerResponse
 * @param {number} status - HTTP status code (400-599)
 * @param {string|Error} errorOrMessage - human-readable message
 * @param {object=} opts - { code, details, hint, request_id }
 */
function sendError(res, status, errorOrMessage, opts = {}) {
  const error = errorOrMessage instanceof Error
    ? errorOrMessage.message
    : String(errorOrMessage || 'Unknown error');
  const body = { error };
  if (opts.code)        body.code = String(opts.code);
  if (opts.details !== undefined) body.details = opts.details;
  if (opts.hint)        body.hint = String(opts.hint);
  if (opts.request_id)  body.request_id = String(opts.request_id);

  try {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  } catch (_) {
    // Fallback for handlers using Express-style res.status/json
    if (typeof res.status === 'function') return res.status(status).json(body);
  }
  return body;
}

/**
 * Sends a JSON success response with { success: true, ...payload }.
 */
function sendSuccess(res, status, payload = {}) {
  const body = Object.assign({ success: true }, payload);
  try {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  } catch (_) {
    if (typeof res.status === 'function') return res.status(status).json(body);
  }
  return body;
}

/** Convenience: 400 bad request. */
function badRequest(res, message, opts) { return sendError(res, 400, message, opts); }
/** Convenience: 401 unauthorized. */
function unauthorized(res, message, opts) { return sendError(res, 401, message || 'Unauthorized.', opts); }
/** Convenience: 404 not found. */
function notFound(res, message, opts) { return sendError(res, 404, message || 'Not found.', opts); }
/** Convenience: 405 method not allowed. */
function methodNotAllowed(res, allowed) {
  if (Array.isArray(allowed)) {
    try { res.setHeader('Allow', allowed.join(', ')); } catch (_) {}
  }
  return sendError(res, 405, 'Method not allowed.', { code: 'METHOD_NOT_ALLOWED' });
}
/** Convenience: 500 internal server error — intentionally generic public message, structured details for logs. */
function internalError(res, err, opts) {
  const msg = err instanceof Error ? err.message : String(err || 'Internal server error');
  return sendError(res, 500, 'Internal server error.', Object.assign({
    code: 'INTERNAL_ERROR',
    details: process.env.NODE_ENV === 'production' ? undefined : msg
  }, opts || {}));
}

module.exports = {
  sendError,
  sendSuccess,
  badRequest,
  unauthorized,
  notFound,
  methodNotAllowed,
  internalError
};
