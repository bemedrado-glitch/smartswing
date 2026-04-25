/**
 * Lead normaliser — same shape every source emits.
 *
 * Maps to marketing_contacts columns (no schema changes needed):
 *   email, name, phone, persona, source, tags[], website, city,
 *   state_region, country, country_code, address, latitude, longitude,
 *   data_source, consent_status, federation_id, country_code,
 *   enrichment_source, enrichment_batch, club_affiliation_name
 */
'use strict';

function _strip(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

function normaliseEmail(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toLowerCase();
  // Reject obvious garbage / role boxes that won't engage
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return '';
  return s;
}

function normalisePhone(raw, defaultCountryCode) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  if (!s) return '';
  // Add country prefix if missing
  if (!s.startsWith('+')) {
    const dial = ({ US: '+1', GB: '+44', AU: '+61', FR: '+33', DE: '+49',
                    IT: '+39', ES: '+34', JP: '+81', CN: '+86', BR: '+55' })[defaultCountryCode];
    if (dial && s.length >= 7) s = dial + s.replace(/^0+/, '');
  }
  return s;
}

function normaliseUrl(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).toString(); } catch (_) { return ''; }
}

/**
 * Build a `marketing_contacts` row from a source's raw scrape.
 *
 * @param {Object} input
 * @param {string} input.federationId  e.g. 'USTA'
 * @param {string} input.country        e.g. 'United States'
 * @param {string} input.countryCode    ISO-2  e.g. 'US'
 * @param {'club'|'coach'|'academy'} input.persona
 * @param {string} input.batchId        e.g. '2026-04-25:USTA:run-3'
 * @param {Object} input.raw            { name, email, phone, website, city, state, address, profileUrl, ... }
 * @returns {Object|null}  null if email or name is missing (no-PII rows are dropped)
 */
function buildContactRow(input) {
  const email = normaliseEmail(input.raw.email);
  const name = _strip(input.raw.name);
  // Hard requirement: we won't insert without an email. Federation
  // listings without contact email are not actionable as leads.
  if (!email || !name) return null;

  const tags = ['lead-harvest', 'b2b', input.persona, 'federation:' + input.federationId];
  if (input.raw.tags) tags.push(...input.raw.tags);

  // marketing_contacts.persona enum is { player, coach, club, parent,
  // pickleball }. Academies don't have their own slot — they're a kind
  // of club for persona purposes, with the granular distinction
  // preserved in `tags` ('academy' tag) for filtering.
  const dbPersona = (input.persona === 'academy') ? 'club' : input.persona;

  return {
    email,
    name,
    phone: normalisePhone(input.raw.phone, input.countryCode),
    persona: dbPersona,                       // db value: 'club' | 'coach'
    // marketing_contacts.stage enum: { lead, prospect, trial, customer, churned }
    // Cold harvest contacts → 'lead' (we know they exist + their info; we
    // haven't engaged them yet). 'cold' is not a valid stage value.
    stage: 'lead',
    source: 'lead-harvest:' + input.federationId.toLowerCase(),
    data_source: 'federation:' + input.federationId,
    // Must match the marketing_contacts_consent_status_check enum:
    // 'public_record' | 'opt_in' | 'pending_consent' | 'opted_out'.
    // Federation-directory contacts are GDPR Recital 47 "publicly
    // available" → maps to 'public_record'.
    consent_status: 'public_record',
    enrichment_source: 'lead-harvest:v1',
    enrichment_batch: input.batchId,
    federation_id: input.federationId,
    country: input.country,
    country_code: input.countryCode,
    city: _strip(input.raw.city),
    state_region: _strip(input.raw.state),
    address: _strip(input.raw.address),
    website: normaliseUrl(input.raw.website),
    latitude: Number.isFinite(input.raw.lat) ? input.raw.lat : null,
    longitude: Number.isFinite(input.raw.lng) ? input.raw.lng : null,
    federation_profile_url: input.raw.profileUrl || null,
    club_affiliation_name: input.persona === 'coach' ? _strip(input.raw.club) : null,
    tags,
    notes: input.raw.notes || ('Harvested ' + new Date().toISOString().slice(0, 10) + ' from ' + input.federationId + ' public ' + input.persona + ' directory.')
  };
}

module.exports = { buildContactRow, normaliseEmail, normalisePhone, normaliseUrl };
