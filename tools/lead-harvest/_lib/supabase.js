/**
 * Thin Supabase wrapper for batch lead upserts.
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env.
 * Falls back to a local-only mode (writes JSON to runs/) when keys
 * aren't set, so harvest can always be developed without prod creds.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function isConfigured() {
  return !!(URL && KEY);
}

/**
 * Upsert a batch of contacts. Conflict on `email` (existing rows are
 * updated with any new fields, never overwriting `consent_status` or
 * `created_at`). Idempotent for re-runs.
 */
async function upsertBatch(rows) {
  if (!rows || !rows.length) return { inserted: 0, errors: [] };
  if (!isConfigured()) {
    return { inserted: 0, errors: ['supabase-not-configured'], dryRun: true };
  }

  const url = `${URL}/rest/v1/marketing_contacts?on_conflict=email`;
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation'
  };

  // Chunk to keep payloads under PostgREST's default body limit
  const CHUNK = 200;
  let inserted = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(slice) });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        errors.push(`chunk ${i / CHUNK}: HTTP ${res.status} — ${txt.slice(0, 200)}`);
        continue;
      }
      const data = await res.json().catch(() => []);
      inserted += Array.isArray(data) ? data.length : slice.length;
    } catch (err) {
      errors.push(`chunk ${i / CHUNK}: ${err.message}`);
    }
  }
  return { inserted, errors };
}

/**
 * Persist the per-source run audit log next to the source code so
 * compliance can trace any row back to its scrape session.
 */
function writeRunLog(sourceId, payload) {
  const dir = path.join(__dirname, '..', 'runs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${sourceId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

module.exports = { upsertBatch, isConfigured, writeRunLog };
