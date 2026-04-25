/**
 * Manifest source — loads any manifests/<id>.json file and emits
 * normalised contact rows. Used as the universal fallback when a
 * federation doesn't expose a clean API.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildContactRow } = require('../_lib/normalise.js');

const MANIFEST_DIR = path.join(__dirname, '..', 'manifests');

function listManifests() {
  if (!fs.existsSync(MANIFEST_DIR)) return [];
  return fs.readdirSync(MANIFEST_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

function loadManifest(id) {
  const file = path.join(MANIFEST_DIR, id + '.json');
  if (!fs.existsSync(file)) throw new Error('No manifest at ' + file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Emit normalised rows from a single manifest file.
 */
function rowsFromManifest(id, opts = {}) {
  const manifest = loadManifest(id);
  const meta = manifest._meta || {};
  const limit = opts.limit || Infinity;
  const out = [];
  for (const r of (manifest.records || [])) {
    if (out.length >= limit) break;
    const row = buildContactRow({
      federationId: meta.federation_id || id.toUpperCase(),
      country: meta.country || '',
      countryCode: meta.country_code || '',
      persona: r.persona || 'club',
      batchId: opts.batchId,
      raw: r
    });
    if (row) out.push(row);
  }
  return out;
}

module.exports = { listManifests, loadManifest, rowsFromManifest };
