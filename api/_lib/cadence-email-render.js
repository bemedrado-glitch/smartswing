/**
 * SmartSwing AI — Cadence Email/SMS Merge-Tag + Shell Renderer
 *
 * Single choke-point between the cadence-runner pulling a pending step
 * out of the DB and the actual Resend/SNS call. Guarantees:
 *  1. Every {{merge_tag}} in subject/body/message gets substituted.
 *  2. Short plain-HTML bodies (likely half-finished drafts in the cadence
 *     library) get auto-wrapped in the shared SmartSwing dark email shell
 *     so they look like the hand-crafted transactional templates.
 *  3. Long bodies or bodies that already declare <!DOCTYPE>/<html> are
 *     passed through as-is — respects hand-crafted cadence emails.
 *
 * Heuristic for auto-wrap (option C, per product decision 2026-04-20):
 *   Wrap iff body length < AUTOWRAP_MAX_LEN AND body lacks <!DOCTYPE / <html.
 */

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com').replace(/\/+$/, '');
const AUTOWRAP_MAX_LEN = 1500;

// ── Design tokens (kept in sync with email-templates.js base shell) ──────────
const C = {
  bg: '#0a0a0a',
  panel: '#16161a',
  border: '#2a2a30',
  text: '#f5f7fa',
  muted: '#9aa5b4',
  volt: '#39ff14'
};

function buildVars(contact = {}, extras = {}) {
  const fullName = String(contact.name || '').trim();
  const firstName = fullName ? fullName.split(/\s+/)[0] : '';
  const email = String(contact.email || '').trim();
  const unsubscribeUrl = `${APP_URL}/unsubscribe.html?c=${encodeURIComponent(contact.id || '')}`;
  return {
    first_name: firstName || 'there',
    name: fullName || 'there',
    email,
    stage: String(contact.stage || '').trim(),
    unsubscribe_url: unsubscribeUrl,
    app_url: APP_URL,
    pricing_url: `${APP_URL}/pricing.html`,
    analyze_url: `${APP_URL}/analyze.html`,
    dashboard_url: `${APP_URL}/dashboard.html`,
    login_url: `${APP_URL}/login.html`,
    ...extras
  };
}

function substitute(str, vars) {
  if (!str) return '';
  return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const val = vars[key];
    if (val === undefined || val === null) return ''; // unknown token → empty (prevents "Hi {{mystery}}" leaking)
    return String(val);
  });
}

function looksLikeFullHtml(s) {
  if (!s) return false;
  const head = s.slice(0, 200).toLowerCase();
  return head.includes('<!doctype') || head.includes('<html');
}

/**
 * Escape-to-HTML for plain-text bodies stored in the cadence table.
 * Preserves line breaks as <br>; doesn't touch existing tags.
 * Only used when wrapping.
 */
function toHtmlParagraphs(s) {
  if (!s) return '';
  // If the body already contains block-level HTML, don't double-escape it;
  // just return as-is inside the panel.
  if (/<(p|div|h[1-6]|ul|ol|li|table|a|strong|em|br)\b/i.test(s)) {
    return s;
  }
  return s
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.6;color:${C.text};">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function wrapInShell({ bodyHtml, preheader = '', unsubscribeUrl }) {
  const pre = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartSwing AI</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${C.text};-webkit-text-size-adjust:100%;">
${pre}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${C.bg};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" style="max-width:560px;" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="padding:0 0 24px 0;text-align:left;">
            <a href="${APP_URL}" style="text-decoration:none;font-size:20px;font-weight:800;color:${C.text};letter-spacing:-0.3px;">
              SmartSwing<span style="color:${C.volt};">.</span>AI
            </a>
          </td>
        </tr>
        <tr>
          <td style="background-color:${C.panel};border:1px solid ${C.border};border-radius:20px;padding:36px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 0 0;text-align:center;font-size:12px;color:${C.muted};line-height:1.7;">
            SmartSwing AI &bull; AI-Powered Tennis Coaching<br>
            <a href="${APP_URL}/privacy-policy.html" style="color:${C.muted};text-decoration:underline;">Privacy</a> &nbsp;&bull;&nbsp;
            <a href="${APP_URL}/user-agreement.html" style="color:${C.muted};text-decoration:underline;">Terms</a> &nbsp;&bull;&nbsp;
            <a href="${unsubscribeUrl}" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Render a cadence email step ready for Resend.
 * @param {object} step - DB row from cadence_step_executions (has subject, body)
 * @param {object} contact - marketing_contacts row (has id, name, email, stage)
 * @returns {{ subject: string, html: string }}
 */
function renderCadenceEmail(step, contact) {
  const vars = buildVars(contact);
  const subject = substitute(step.subject || 'A quick note from SmartSwing AI', vars);
  const rawBody = substitute(step.body || '', vars);

  const isFullDoc = looksLikeFullHtml(rawBody);
  const shouldWrap = !isFullDoc && rawBody.length < AUTOWRAP_MAX_LEN;

  const html = shouldWrap
    ? wrapInShell({
        bodyHtml: toHtmlParagraphs(rawBody),
        preheader: subject,
        unsubscribeUrl: vars.unsubscribe_url
      })
    : rawBody;

  return { subject, html };
}

/**
 * Render a cadence SMS step. Only token substitution — no shell.
 * @param {object} step
 * @param {object} contact
 * @returns {{ message: string }}
 */
function renderCadenceSms(step, contact) {
  const vars = buildVars(contact);
  return { message: substitute(step.message || '', vars) };
}

module.exports = {
  renderCadenceEmail,
  renderCadenceSms,
  // exported for tests only
  _buildVars: buildVars,
  _substitute: substitute,
  _looksLikeFullHtml: looksLikeFullHtml,
  _AUTOWRAP_MAX_LEN: AUTOWRAP_MAX_LEN
};
