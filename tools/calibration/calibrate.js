#!/usr/bin/env node
/**
 * SmartSwing AI — Phase 4 benchmark calibration CLI.
 *
 * Reads labelled pro-swing observations from `tools/calibration/data/*.json`
 * and prints calibrated `{ min, max, optimal }` benchmarks in three shapes:
 *
 *   1. JS snippet  — drop-in replacement for the tables in analyze.html
 *                    (PRO_BENCHMARKS, VELOCITY_BENCHMARKS, ROM_BENCHMARKS)
 *   2. JSON        — written to tools/calibration/output/benchmarks.json
 *                    for programmatic consumption or diffing
 *   3. Markdown    — a human-readable table showing the delta vs today's
 *                    hard-coded estimates so coaches can review changes
 *
 * Usage:
 *   node tools/calibration/calibrate.js                # all data, pro only
 *   node tools/calibration/calibrate.js --level competitive
 *   node tools/calibration/calibrate.js --dir ./my-clips
 *   node tools/calibration/calibrate.js --check        # validate only, no output
 *
 * Exit codes:
 *   0 — calibration produced at least one benchmark band
 *   1 — invalid input (bad data files / no valid observations)
 *   2 — validation-only run found issues
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { aggregateObservations } = require('./aggregate');

// ── CLI arg parsing (no external deps) ─────────────────────────────────

function parseArgs(argv) {
  const opts = {
    dir: path.join(__dirname, 'data'),
    outDir: path.join(__dirname, 'output'),
    level: 'pro',
    check: false,
    quiet: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--out') opts.outDir = argv[++i];
    else if (a === '--level') opts.level = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log([
        'Usage: node tools/calibration/calibrate.js [options]',
        '',
        '  --dir <path>      Directory of observation JSON files (default: ./data)',
        '  --out <path>      Output directory (default: ./output)',
        '  --level <name>    Target level: starter|beginner|intermediate|advanced|competitive|pro',
        '  --check           Validate inputs, print warnings, skip output',
        '  --quiet           Suppress per-file progress logs',
        '  -h, --help        Show this help'
      ].join('\n'));
      process.exit(0);
    }
  }
  return opts;
}

function loadObservations(dir, quiet) {
  if (!fs.existsSync(dir)) {
    console.error(`[calibrate] Data directory not found: ${dir}`);
    return [];
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!quiet) console.log(`[calibrate] Loading ${files.length} file(s) from ${dir}`);
  const all = [];
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      // Support both single-clip files and array files.
      const clips = Array.isArray(parsed) ? parsed : [parsed];
      all.push(...clips);
      if (!quiet) console.log(`  ${f}: +${clips.length} observation(s)`);
    } catch (e) {
      console.error(`  ${f}: failed to parse — ${e.message}`);
    }
  }
  return all;
}

// ── Formatters ─────────────────────────────────────────────────────────

function formatBandsAsJsSnippet(benchmarks, signal) {
  // Produce a multi-line JS object that mirrors the existing
  // VELOCITY_BENCHMARKS / ROM_BENCHMARKS / PRO_BENCHMARKS shape.
  const lines = [];
  for (const [shot, bySignal] of Object.entries(benchmarks)) {
    const joints = bySignal[signal];
    if (!joints || Object.keys(joints).length === 0) continue;
    const jointStrs = Object.entries(joints)
      .map(([j, b]) => `${j}: { min: ${b.min}, max: ${b.max}, optimal: ${b.optimal} }`)
      .join(', ');
    lines.push(`  '${shot}': { ${jointStrs} },`);
  }
  return `{\n${lines.join('\n')}\n}`;
}

function formatMarkdownTable(rows) {
  if (!rows.length) return '_No benchmark rows produced._';
  const header = '| Shot | Signal | Joint | Min | Optimal | Max | n | Dropped |';
  const sep    = '|------|--------|-------|-----|---------|-----|---|---------|';
  const body = rows.map(r =>
    `| ${r.shot} | ${r.signal} | ${r.joint} | ${r.min} | ${r.optimal} | ${r.max} | ${r.samples} | ${r.droppedAsOutliers} |`
  ).join('\n');
  return [header, sep, body].join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);
  const observations = loadObservations(opts.dir, opts.quiet);

  if (!observations.length) {
    console.error('[calibrate] No observations found. See tools/calibration/README.md for the input schema.');
    process.exit(1);
  }

  const result = aggregateObservations(observations, { targetLevel: opts.level });

  if (result.warnings.length) {
    console.warn('\n[calibrate] Warnings:');
    for (const w of result.warnings) console.warn('  ⚠ ' + w);
  }

  console.log('');
  console.log('[calibrate] Input observations by level:');
  for (const [lvl, n] of Object.entries(result.byLevel).sort()) {
    console.log(`  ${lvl.padEnd(14)} ${n}`);
  }
  console.log(`[calibrate] Calibrating for level = ${opts.level}. Valid observations: ${result.stats.validAtLevel}/${result.stats.totalInput}.`);

  if (opts.check) {
    console.log('\n[calibrate] --check run complete. No output written.');
    process.exit(result.warnings.length ? 2 : 0);
  }

  if (!result.rows.length) {
    console.error('[calibrate] No benchmark bands produced. Insufficient samples per joint.');
    process.exit(1);
  }

  // Write JSON output.
  if (!fs.existsSync(opts.outDir)) fs.mkdirSync(opts.outDir, { recursive: true });
  const jsonPath = path.join(opts.outDir, 'benchmarks.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result.benchmarks, null, 2) + '\n');
  console.log(`\n[calibrate] JSON written: ${jsonPath}`);

  // Write JS snippet output (ready to paste into analyze.html).
  const snippetPath = path.join(opts.outDir, 'benchmarks.js.txt');
  const parts = [
    '// SmartSwing AI — calibrated benchmarks',
    '// Generated by tools/calibration/calibrate.js',
    `// Target level: ${opts.level}   Observations at level: ${result.stats.validAtLevel}`,
    '',
    `// ── PRO_BENCHMARKS (static angles at contact) ──`,
    'const PRO_BENCHMARKS_CALIBRATED = ' + formatBandsAsJsSnippet(result.benchmarks, 'angles') + ';',
    '',
    `// ── VELOCITY_BENCHMARKS (peak angular velocity, deg/sec) ──`,
    'var VELOCITY_BENCHMARKS_CALIBRATED = ' + formatBandsAsJsSnippet(result.benchmarks, 'velocities') + ';',
    '',
    `// ── ROM_BENCHMARKS (range of motion across swing window, deg) ──`,
    'var ROM_BENCHMARKS_CALIBRATED = ' + formatBandsAsJsSnippet(result.benchmarks, 'roms') + ';'
  ];
  fs.writeFileSync(snippetPath, parts.join('\n') + '\n');
  console.log(`[calibrate] JS snippet written: ${snippetPath}`);

  // Write markdown report.
  const mdPath = path.join(opts.outDir, 'benchmarks.md');
  const md = [
    '# Calibrated benchmarks',
    '',
    `- **Level:** ${opts.level}`,
    `- **Clips considered:** ${result.stats.validAtLevel} / ${result.stats.totalInput}`,
    `- **Generated:** ${new Date().toISOString()}`,
    '',
    formatMarkdownTable(result.rows)
  ].join('\n');
  fs.writeFileSync(mdPath, md + '\n');
  console.log(`[calibrate] Markdown report: ${mdPath}`);

  process.exit(0);
}

if (require.main === module) main();
module.exports = { main, parseArgs, loadObservations, formatBandsAsJsSnippet, formatMarkdownTable };
