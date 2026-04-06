#!/usr/bin/env node
/**
 * SmartSwing AI — Lightweight Syntax Smoke Test
 *
 * Runs `new Function(src)` against every <script> block inside the public
 * HTML pages and against the standalone JS files. Catches the bulk of
 * syntax regressions before deploy without needing a full browser.
 *
 * Run via:  npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const HTML_FILES = [
  'analyze.html',
  'dashboard.html',
  'coach-dashboard.html',
  'index.html',
  'pricing.html',
  'checkout.html',
  'cart.html',
  'login.html',
  'signup.html',
  'auth-callback.html',
  'welcome.html',
  'settings.html',
  'library.html',
  'payment-success.html',
  'payment-cancelled.html'
];

const JS_FILES = [
  'app-data.js',
  'public-app-config.js',
  'growth-forms.js'
];

let total = 0;
let failed = 0;
const errors = [];

function checkScript(label, src) {
  total++;
  try {
    // eslint-disable-next-line no-new-func
    new Function(src);
  } catch (err) {
    failed++;
    errors.push(`✗ ${label}\n   → ${err.message}`);
  }
}

for (const file of HTML_FILES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  // Match inline <script> blocks (skip those with src= and JSON-LD type=application/ld+json)
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type\s*=\s*["']application\/(?:ld\+)?json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    checkScript(`${file} [block ${++i}]`, m[1]);
  }
}

for (const file of JS_FILES) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  checkScript(file, src);
}

if (failed) {
  console.error(`\n❌ Syntax check FAILED — ${failed}/${total} blocks failed:\n`);
  errors.forEach((e) => console.error(e));
  process.exit(1);
}

console.log(`✓ Syntax check passed — ${total}/${total} script blocks parsed cleanly.`);
process.exit(0);
