/**
 * SmartSwing AI — Messaging channel router (WhatsApp vs SMS)
 *
 * Mirror of the SQL function resolve_messaging_channel(phone, preferred).
 * Kept in JS so the cadence-runner can decide without a round-trip to the DB
 * when it already has the contact row in memory.
 *
 * Strategy (option D, 2026-04-20):
 *   • explicit 'whatsapp' | 'sms' preference wins
 *   • 'auto' (default) → infer from E.164 country code
 *
 * Keep this list in sync with supabase/migrations/20260420_whatsapp_cadence.sql
 */

// 3-digit country codes checked first (more specific than 2-digit)
const WA_PREFIXES_3 = new Set([
  '598', // Uruguay
  '593', // Ecuador
  '591', // Bolivia
  '595', // Paraguay
  '506', // Costa Rica
  '507', // Panama
  '502', // Guatemala
  '351', // Portugal
  '971', // UAE
  '966', // Saudi Arabia
  '254', // Kenya
  '234'  // Nigeria
]);

// 2-digit country codes (checked after 3-digit miss)
const WA_PREFIXES_2 = new Set([
  // LatAm
  '55', // Brazil
  '52', // Mexico
  '54', // Argentina
  '56', // Chile
  '57', // Colombia
  '51', // Peru
  '58', // Venezuela
  // Europe
  '34', // Spain
  '39', // Italy
  '49', // Germany
  '31', // Netherlands
  '90', // Turkey
  '30', // Greece
  // Asia / Africa / ME
  '91', // India
  '62', // Indonesia
  '60', // Malaysia
  '92', // Pakistan
  '27', // South Africa
  '20'  // Egypt
]);

/**
 * @param {string|null|undefined} phone - E.164 or loosely-formatted number
 * @param {'whatsapp'|'sms'|'auto'|null|undefined} preferred - per-contact override
 * @returns {'whatsapp'|'sms'}
 */
function resolveChannel(phone, preferred = 'auto') {
  // Explicit override wins
  if (preferred === 'whatsapp' || preferred === 'sms') return preferred;

  if (!phone || String(phone).trim().length < 4) return 'sms';
  const digits = String(phone).replace(/[^0-9]/g, '');

  if (WA_PREFIXES_3.has(digits.slice(0, 3))) return 'whatsapp';
  if (WA_PREFIXES_2.has(digits.slice(0, 2))) return 'whatsapp';

  return 'sms';
}

/**
 * Derive the best Meta template language code for a phone number.
 * Meta template `language.code` values we support:
 *   en_US (default), pt_BR, es_LA (Latin-American Spanish), es_ES (Spain),
 *   it_IT, de_DE, fr_FR, id_ID, hi_IN, ar_AE, tr_TR, nl_NL
 *
 * If you haven't submitted a non-English variant of a template, Meta falls
 * back to en_US automatically (no error) — but approval for a given locale
 * must match what's actually submitted.
 *
 * @param {string|null|undefined} phone
 * @returns {string} Meta language code (defaults to 'en_US')
 */
function resolveTemplateLang(phone) {
  // Default 'en' matches Meta's actual approved language code for our templates
  // (not en_US — Meta categorizes "English" submissions as just `en`).
  if (!phone) return 'en';
  const digits = String(phone).replace(/[^0-9]/g, '');
  // 3-digit prefixes first
  const p3 = digits.slice(0, 3);
  if (p3 === '351') return 'pt_PT';
  if (p3 === '598' || p3 === '593' || p3 === '591' || p3 === '595' ||
      p3 === '506' || p3 === '507' || p3 === '502') return 'es_LA';
  if (p3 === '971' || p3 === '966') return 'ar_AE';
  // 2-digit
  const p2 = digits.slice(0, 2);
  if (p2 === '55') return 'pt_BR';
  if (p2 === '52' || p2 === '54' || p2 === '56' || p2 === '57' ||
      p2 === '51' || p2 === '58') return 'es_LA';
  if (p2 === '34') return 'es_ES';
  if (p2 === '39') return 'it_IT';
  if (p2 === '49') return 'de_DE';
  if (p2 === '31') return 'nl_NL';
  if (p2 === '90') return 'tr_TR';
  if (p2 === '91') return 'hi_IN';
  if (p2 === '62') return 'id_ID';
  if (p2 === '20') return 'ar_AE';
  if (p2 === '33') return 'fr_FR';
  return 'en';
}

module.exports = {
  resolveChannel,
  resolveTemplateLang,
  // exported for tests / diagnostics
  WA_PREFIXES_2,
  WA_PREFIXES_3
};
