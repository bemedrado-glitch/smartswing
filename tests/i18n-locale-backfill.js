#!/usr/bin/env node
/**
 * SmartSwing AI — Cross-locale i18n backfill.
 *
 * For every key present in translations/en.json but missing from another
 * locale file, copies the English value into that locale with a leading
 * `[en]` marker so translators know the string hasn't been localized yet.
 *
 * Pairs with:
 *   - tests/i18n-audit.js      → CI gate
 *   - tests/i18n-backfill.js   → seeded en.json from extracted HTML text
 *
 * Without this step, authors who add a new key to HTML must touch 8 locale
 * files or the CI gate fails. With this step, they update en.json only,
 * this script propagates the stub to every other locale, and translators
 * clean up the `[en]` markers on their own cadence.
 *
 * Run once to clear the backlog:
 *   node tests/i18n-locale-backfill.js
 *
 * Run as a pre-commit hook or manually before pushing a PR that adds keys.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TR = path.join(ROOT, 'translations');
const LOCALES = ['pt-BR', 'es', 'de', 'fr', 'ru', 'zh', 'ja'];

function load(lang) {
  return JSON.parse(fs.readFileSync(path.join(TR, `${lang}.json`), 'utf8'));
}

function save(lang, obj) {
  fs.writeFileSync(path.join(TR, `${lang}.json`), JSON.stringify(obj, null, 2) + '\n');
}

function flatten(obj, prefix = '', out = {}) {
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, full, out);
    else out[full] = v;
  }
  return out;
}

function setDeep(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

const en = flatten(load('en'));
let totalAdded = 0;

for (const lang of LOCALES) {
  const locale = load(lang);
  const present = flatten(locale);
  const missing = Object.keys(en).filter(k => !(k in present));
  if (missing.length === 0) {
    console.log(`✓ ${lang}: already covers all ${Object.keys(en).length} keys`);
    continue;
  }
  for (const key of missing) {
    // `[en]` prefix is a hint to translators that the string is English,
    // surviving untouched until they replace it.
    setDeep(locale, key, '[en] ' + String(en[key]));
  }
  save(lang, locale);
  console.log(`✓ ${lang}: added ${missing.length} stub keys (prefixed "[en] ")`);
  totalAdded += missing.length;
}

console.log(`\nAdded ${totalAdded} stub translations across ${LOCALES.length} locales.`);
