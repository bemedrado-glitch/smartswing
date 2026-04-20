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

module.exports = {
  resolveChannel,
  // exported for tests / diagnostics
  WA_PREFIXES_2,
  WA_PREFIXES_3
};
