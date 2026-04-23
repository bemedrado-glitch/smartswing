#!/usr/bin/env node
/**
 * SmartSwing AI — One-time i18n backfill helper.
 *
 * Reads the list of keys missing from translations/en.json (computed by
 * tests/i18n-audit.js), finds each in the HTML, extracts the element's
 * innerText, and writes those values into en.json. Placeholders attached
 * via data-i18n-placeholder are captured from the element's placeholder
 * attribute instead of innerText.
 *
 * Run once:
 *   node tests/i18n-backfill.js
 *   node tests/i18n-audit.js   # should now pass Pass 1
 *
 * Design choices:
 *   - Only touches en.json (source of truth). Other locales remain as-is;
 *     translators wire them up when ready.
 *   - Uses a very lightweight HTML parse (regex) — we're extracting short
 *     labels, not navigating DOM hierarchy, so it's fine.
 *   - When a key is used in multiple files with different text, the first
 *     occurrence wins. Audit deliberately tolerates unused keys so this
 *     is safe.
 *   - Keys whose element has complex inner HTML fall back to a `TODO:`
 *     placeholder + the key name. Author must manually clean these up.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEn() {
  const p = path.join(ROOT, 'translations/en.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveEn(obj) {
  const p = path.join(ROOT, 'translations/en.json');
  // 2-space indent matches existing style.
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function setDeep(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  // Don't overwrite existing values (idempotent).
  if (cur[parts[parts.length - 1]] === undefined) {
    cur[parts[parts.length - 1]] = value;
    return true;
  }
  return false;
}

function extractValueForKey(html, key) {
  // Escape key for regex.
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. data-i18n="key" → pick text content between opening and closing tag.
  //    Look for the element that has this attribute and grab its inner text.
  //    We do this with a tolerant regex: find the tag, then match up to its
  //    close tag (non-greedy). This misses nested same-name tags but is
  //    good enough for <span>, <p>, <a>, <h*>, <li>.
  const inner = new RegExp(
    `<(\\w+)[^>]*\\bdata-i18n="${esc}"[^>]*>([\\s\\S]*?)</\\1>`,
    'i'
  );
  let m = html.match(inner);
  if (m) {
    let text = m[2]
      .replace(/<!--[\s\S]*?-->/g, '')   // strip comments
      .replace(/<[^>]+>/g, ' ')           // strip nested tags
      .replace(/\s+/g, ' ')
      .trim();
    if (text && !/^\s*$/.test(text)) return text;
  }

  // 2. data-i18n-placeholder="key" → grab placeholder attribute value.
  const ph = new RegExp(
    `<[^>]*\\bdata-i18n-placeholder="${esc}"[^>]*\\bplaceholder="([^"]*)"`,
    'i'
  );
  m = html.match(ph);
  if (m) return m[1].trim();
  const phAlt = new RegExp(
    `<[^>]*\\bplaceholder="([^"]*)"[^>]*\\bdata-i18n-placeholder="${esc}"`,
    'i'
  );
  m = html.match(phAlt);
  if (m) return m[1].trim();

  // 3. data-i18n-html="key" → grab inner HTML preserving tags.
  const inHtml = new RegExp(
    `<(\\w+)[^>]*\\bdata-i18n-html="${esc}"[^>]*>([\\s\\S]*?)</\\1>`,
    'i'
  );
  m = html.match(inHtml);
  if (m) {
    const text = m[2].replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  return null;
}

function readMissingKeys() {
  // Re-run the audit's key-extraction logic so we don't depend on a temp file.
  const HTML_DIR = ROOT;
  const files = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));
  const htmlKeys = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
    const re = /data-i18n(?:-placeholder|-html)?="([^"]+)"/g;
    let m;
    while ((m = re.exec(src)) !== null) htmlKeys.add(m[1].trim());
  }

  const en = loadEn();
  function flatten(obj, prefix = '') {
    const out = new Set();
    for (const k of Object.keys(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        flatten(v, full).forEach(x => out.add(x));
      } else out.add(full);
    }
    return out;
  }
  const existing = flatten(en);
  return [...htmlKeys].filter(k => !existing.has(k)).sort();
}

function main() {
  const missing = readMissingKeys();
  console.log(`Missing keys to backfill: ${missing.length}\n`);
  if (!missing.length) {
    console.log('✓ Nothing to do — en.json already covers every HTML key.');
    return;
  }

  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const htmlBlobs = files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);

  const en = loadEn();
  let filled = 0, todo = 0;

  for (const key of missing) {
    let value = null;
    for (const [name, src] of htmlBlobs) {
      value = extractValueForKey(src, key);
      if (value) {
        console.log(`  ✓ ${key.padEnd(45)} ← "${value.slice(0, 60)}${value.length > 60 ? '…' : ''}"  (${name})`);
        filled++;
        break;
      }
    }
    if (!value) {
      // Couldn't extract — use a TODO placeholder tied to the key.
      value = `TODO: ${key}`;
      console.log(`  ? ${key.padEnd(45)} ← ${value}`);
      todo++;
    }
    setDeep(en, key, value);
  }

  saveEn(en);
  console.log(`\nBackfilled ${filled} keys with extracted text, ${todo} placeholders.`);
  console.log(`Wrote translations/en.json.`);
  if (todo > 0) {
    console.log(`\nNext: manually replace the TODO placeholders with proper strings.`);
  }
}

main();
