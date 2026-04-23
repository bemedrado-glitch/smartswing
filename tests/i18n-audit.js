#!/usr/bin/env node
/**
 * SmartSwing AI — i18n key-coverage audit.
 *
 * Walks every HTML file for `data-i18n`, `data-i18n-placeholder`, and
 * `data-i18n-html` attributes, then cross-references each unique key against
 * translations/*.json. Fails the build when:
 *   - any HTML key is missing from en.json (the source of truth)
 *   - a non-English locale is missing > MAX_MISSING_RATIO of keys present in en
 *
 * What it doesn't gate on (by design):
 *   - Unused keys in a locale — i18n.js is tolerant, and some keys ship ahead
 *     of the markup that'll eventually use them
 *   - Placeholder-identical-to-English strings (not-yet-translated markers
 *     are the translator's concern, not CI's)
 *
 * Exit codes:
 *   0 → all required coverage met
 *   1 → failures (printed with file + key path + suggested fix)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML_DIR = ROOT;
const TRANSLATIONS_DIR = path.join(ROOT, 'translations');

// Allow up to 5% of en keys to be missing from a translated locale before we
// fail. Real-world copy catches up with translations in waves; gating at 100%
// would block every feature PR until every locale is rekeyed.
const MAX_MISSING_RATIO = 0.05;

// Locales we actually ship. Skip anything else in translations/.
const LOCALES = ['en', 'pt-BR', 'es', 'de', 'fr', 'ru', 'zh', 'ja'];

function collectHtmlFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(dir, f));
}

function extractKeysFromHtml(html) {
  const keys = new Set();
  // Match data-i18n / data-i18n-placeholder / data-i18n-html.
  const re = /data-i18n(?:-placeholder|-html)?="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].trim();
    if (key) keys.add(key);
  }
  return keys;
}

function flattenLocale(obj, prefix = '') {
  const out = new Set();
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenLocale(v, full).forEach(x => out.add(x));
    } else {
      out.add(full);
    }
  }
  return out;
}

function loadLocale(lang) {
  const p = path.join(TRANSLATIONS_DIR, `${lang}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`  ✗ ${lang}.json is invalid JSON: ${e.message}`);
    return null;
  }
}

function main() {
  const files = collectHtmlFiles(HTML_DIR);
  const htmlKeys = new Set();
  const keyOrigins = new Map(); // key -> first file that used it

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const keys = extractKeysFromHtml(src);
    const base = path.basename(file);
    keys.forEach(k => {
      htmlKeys.add(k);
      if (!keyOrigins.has(k)) keyOrigins.set(k, base);
    });
  }

  console.log(`HTML files scanned:    ${files.length}`);
  console.log(`Unique i18n keys used: ${htmlKeys.size}\n`);

  // Pass 1: every HTML key must exist in en.json.
  const en = loadLocale('en');
  if (!en) {
    console.error('✗ translations/en.json is missing or invalid. Fatal.');
    process.exit(1);
  }
  const enKeys = flattenLocale(en);
  const missingInEn = [...htmlKeys].filter(k => !enKeys.has(k)).sort();

  if (missingInEn.length) {
    console.error(`✗ ${missingInEn.length} HTML keys missing from translations/en.json:\n`);
    for (const k of missingInEn) {
      console.error(`  - ${k.padEnd(45)}  (first seen in ${keyOrigins.get(k)})`);
    }
    console.error(`\n  Fix: add these entries to translations/en.json (and translate them into each locale).`);
    process.exit(1);
  }
  console.log(`✓ All ${htmlKeys.size} HTML keys present in translations/en.json.\n`);

  // Pass 2: per-locale coverage ratio.
  const totalEnLeaves = enKeys.size;
  let anyFail = false;

  for (const lang of LOCALES) {
    if (lang === 'en') continue;
    const locale = loadLocale(lang);
    if (!locale) {
      console.error(`  ✗ ${lang}.json missing — add it to translations/`);
      anyFail = true;
      continue;
    }
    const localeKeys = flattenLocale(locale);
    // Measure coverage against the subset of en keys actually referenced in HTML.
    const relevantKeys = [...htmlKeys];
    const missing = relevantKeys.filter(k => !localeKeys.has(k));
    const ratio = relevantKeys.length === 0 ? 0 : missing.length / relevantKeys.length;
    const pctMissing = (ratio * 100).toFixed(1);
    const pctCoverage = (100 - parseFloat(pctMissing)).toFixed(1);

    const threshold = MAX_MISSING_RATIO * 100;
    const verdict = ratio > MAX_MISSING_RATIO ? '✗' : '✓';
    console.log(`${verdict} ${lang.padEnd(6)} ${pctCoverage}% coverage  (${missing.length}/${relevantKeys.length} missing, threshold ${(100 - threshold).toFixed(0)}%)`);

    if (ratio > MAX_MISSING_RATIO) {
      anyFail = true;
      // Print the first 10 missing keys so authors know where to start.
      console.error(`    First missing keys:`);
      for (const k of missing.slice(0, 10)) {
        console.error(`      - ${k}`);
      }
      if (missing.length > 10) console.error(`      ... and ${missing.length - 10} more`);
    }
  }

  if (anyFail) {
    console.error(`\n✗ i18n coverage gate failed. Add missing keys to the flagged locale file(s).`);
    process.exit(1);
  }
  console.log(`\n✓ i18n coverage OK across all ${LOCALES.length} locales.`);
}

main();
