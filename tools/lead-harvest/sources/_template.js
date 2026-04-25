/**
 * Federation source template — copy + rename to add a new federation.
 *
 * Implementation tips:
 *   - Try the federation's JSON club-finder endpoint first (every modern
 *     federation has one — open the public club-finder page, watch the
 *     network panel, copy the XHR URL).
 *   - Fall back to sitemap.xml + per-page parsing only if no JSON exists.
 *   - Skip federations that require a logged-in session (USTA League data
 *     is auth-walled — that's NOT this system's scope).
 *   - Always honour robots.txt + use _lib/http.js for polite fetching.
 */
'use strict';

const { fetchJson } = require('../_lib/http.js');
const { buildContactRow } = require('../_lib/normalise.js');

module.exports = {
  id: 'TEMPLATE',          // becomes data_source = 'federation:TEMPLATE'
  country: 'Country Name',
  countryCode: 'XX',        // ISO-2
  consent: 'public-directory',

  /**
   * @param {Object} opts
   * @param {number} [opts.limit]   max records to return (debug)
   * @param {string} opts.batchId   passed through to buildContactRow
   * @returns {Promise<Object[]>}   array of normalised marketing_contacts rows
   */
  async fetch(opts) {
    const limit = opts.limit || Infinity;
    const out = [];

    // EXAMPLE shape — replace with actual federation endpoint
    const data = await fetchJson('https://example.federation.org/api/clubs');
    for (const club of (data.clubs || [])) {
      if (out.length >= limit) break;
      const row = buildContactRow({
        federationId: 'TEMPLATE',
        country: 'Country Name',
        countryCode: 'XX',
        persona: 'club',
        batchId: opts.batchId,
        raw: {
          name: club.name,
          email: club.contact_email,
          phone: club.phone,
          website: club.website,
          city: club.city,
          state: club.state,
          address: club.address,
          lat: club.lat,
          lng: club.lng,
          profileUrl: club.url
        }
      });
      if (row) out.push(row);
    }
    return out;
  }
};
