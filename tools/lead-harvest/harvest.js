#!/usr/bin/env node
/**
 * SmartSwing AI — Lead Harvester entry point.
 *
 * Usage:
 *   node tools/lead-harvest/harvest.js                 # run all manifests, dry run
 *   node tools/lead-harvest/harvest.js --all           # run all, INSERT to Supabase
 *   node tools/lead-harvest/harvest.js --source=usta   # single source, INSERT
 *   node tools/lead-harvest/harvest.js --dry-run       # never write to Supabase
 *   node tools/lead-harvest/harvest.js --limit=5       # cap per source
 *   node tools/lead-harvest/harvest.js --list          # list available sources
 *
 * Compliance: every row carries data_source + consent_status +
 * enrichment_batch tagging so the legal basis is row-level traceable.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { listManifests, rowsFromManifest } = require('./sources/manifest.js');
const { upsertBatch, isConfigured, writeRunLog } = require('./_lib/supabase.js');

function parseArgs(argv) {
  const args = { all: false, dryRun: false, list: false, source: null, limit: null };
  for (const a of argv.slice(2)) {
    if (a === '--all') args.all = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--list') args.list = true;
    else if (a.startsWith('--source=')) args.source = a.slice('--source='.length).toLowerCase();
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
  }
  return args;
}

async function runOne(sourceId, batchId, opts) {
  const rows = rowsFromManifest(sourceId, { batchId, limit: opts.limit });
  console.log(`\n[${sourceId.toUpperCase()}] parsed ${rows.length} rows`);
  if (rows.length === 0) return { source: sourceId, rows: 0, inserted: 0, errors: ['no-rows'] };

  if (opts.dryRun || !isConfigured()) {
    console.log(`[${sourceId.toUpperCase()}] DRY RUN — not writing to Supabase`);
    rows.slice(0, 3).forEach((r, i) => {
      console.log(`  sample ${i+1}: ${r.persona.padEnd(8)} ${r.name.slice(0, 40).padEnd(42)} ${r.email.padEnd(36)} ${r.country_code}`);
    });
    if (rows.length > 3) console.log(`  ... and ${rows.length - 3} more`);
    return { source: sourceId, rows: rows.length, inserted: 0, dryRun: true };
  }

  const result = await upsertBatch(rows);
  console.log(`[${sourceId.toUpperCase()}] inserted/upserted ${result.inserted}; errors: ${result.errors.length}`);
  if (result.errors.length) result.errors.forEach(e => console.log('  err: ' + e));
  return { source: sourceId, rows: rows.length, inserted: result.inserted, errors: result.errors };
}

async function main() {
  const args = parseArgs(process.argv);
  const available = listManifests();

  if (args.list) {
    console.log('Available sources:');
    available.forEach(s => console.log('  ' + s));
    return;
  }

  const targets = args.source
    ? [args.source]
    : args.all
      ? available
      : available; // default: all (but dry-run unless --all explicitly requested)

  // Default to dry-run when neither --source nor --all is specified —
  // protects against accidental mass inserts.
  const dryRun = args.dryRun || (!args.source && !args.all);

  const batchId = new Date().toISOString().slice(0, 19) + ':batch:' + Math.random().toString(36).slice(2, 8);
  console.log(`\nLead-harvest run — batchId=${batchId}`);
  console.log(`Targets: ${targets.join(', ')}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no Supabase writes)' : 'LIVE (will upsert into marketing_contacts)'}`);
  console.log(`Supabase configured: ${isConfigured() ? 'yes' : 'no — forcing dry-run'}`);

  const summary = [];
  for (const t of targets) {
    if (!available.includes(t)) {
      console.log(`\n[${t}] SKIP — no manifest at manifests/${t}.json`);
      continue;
    }
    const r = await runOne(t, batchId, { dryRun, limit: args.limit });
    summary.push(r);
  }

  // Persist run log for audit
  const totals = {
    batchId,
    timestamp: new Date().toISOString(),
    dryRun,
    targets,
    perSource: summary,
    totalRows: summary.reduce((a, s) => a + (s.rows || 0), 0),
    totalInserted: summary.reduce((a, s) => a + (s.inserted || 0), 0)
  };
  const logFile = writeRunLog('batch', totals);
  console.log(`\nRun log: ${logFile}`);
  console.log(`Total rows parsed: ${totals.totalRows}`);
  console.log(`Total inserted/upserted: ${totals.totalInserted}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
