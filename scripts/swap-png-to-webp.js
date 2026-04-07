#!/usr/bin/env node
/**
 * Swap PNG references to their .webp siblings across all HTML files.
 * Only swaps files that have a confirmed .webp sibling on disk.
 *
 * Skips: assets/logos/icon.png (favicon — keep PNG for compatibility)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set([
  'assets/logos/icon.png',
  'assets/logos/logo.png',
  'assets/logos/logo-alpha.png',
  'assets/logos/logo-tight.png'
]);

// Discover candidate pairs: any png in the optimized folders that has a webp sibling
const FOLDERS = ['assets/redesign', 'assets/avatar', 'assets/uiux'];
const pairs = [];
for (const folder of FOLDERS) {
  const abs = path.join(ROOT, folder);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs)) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    const rel = `${folder}/${file}`;
    if (SKIP.has(rel)) continue;
    const webpRel = rel.replace(/\.png$/i, '.webp');
    const webpAbs = path.join(ROOT, webpRel);
    if (fs.existsSync(webpAbs)) pairs.push([rel, webpRel]);
  }
}

console.log(`Found ${pairs.length} png→webp pairs.`);

// Build all replacement string variants (raw + url-encoded spaces)
const variants = [];
for (const [from, to] of pairs) {
  variants.push([from, to]);
  if (from.includes(' ')) {
    variants.push([from.replace(/ /g, '%20'), to.replace(/ /g, '%20')]);
  }
}

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let touched = 0;
let totalSwaps = 0;
for (const file of htmlFiles) {
  const abs = path.join(ROOT, file);
  let content = fs.readFileSync(abs, 'utf8');
  let fileSwaps = 0;
  for (const [from, to] of variants) {
    const parts = content.split(from);
    if (parts.length > 1) {
      fileSwaps += parts.length - 1;
      content = parts.join(to);
    }
  }
  if (fileSwaps > 0) {
    fs.writeFileSync(abs, content);
    touched++;
    totalSwaps += fileSwaps;
    console.log(`  ${file}: ${fileSwaps} swap(s)`);
  }
}
console.log(`\nTotal: ${touched} files, ${totalSwaps} swaps`);
