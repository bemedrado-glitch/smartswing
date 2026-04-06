#!/usr/bin/env node
/**
 * One-shot image optimization pass.
 *
 * Generates .webp siblings (with --resize widths) next to every large source
 * PNG/JPG so the markup can use <picture> sources without changing layouts.
 *
 * Run: node scripts/optimize-images.js
 *
 * Skips files whose .webp sibling already exists and is newer than the
 * source, so subsequent runs are nearly free.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

// [glob-folder, options]
const TARGETS = [
  { dir: 'assets/redesign', maxWidth: 1600, quality: 72 },
  { dir: 'assets/avatar',   maxWidth: 1200, quality: 74 },
  { dir: 'assets/uiux',     maxWidth: 1200, quality: 74 },
  { dir: 'assets/logos',    maxWidth: 800,  quality: 86, alpha: true }
];

const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

async function processFile(srcPath, opts) {
  const ext = path.extname(srcPath).toLowerCase();
  if (!EXTENSIONS.has(ext)) return null;
  const base = srcPath.slice(0, -ext.length);
  const dst = `${base}.webp`;

  // Skip if up to date
  try {
    const srcStat = fs.statSync(srcPath);
    const dstStat = fs.statSync(dst);
    if (dstStat.mtimeMs >= srcStat.mtimeMs) return { skipped: true, src: srcPath };
  } catch (_) { /* dst missing — process */ }

  const image = sharp(srcPath, { failOn: 'none' });
  const meta = await image.metadata();
  const targetWidth = meta.width && meta.width > opts.maxWidth ? opts.maxWidth : meta.width;

  let pipeline = image;
  if (targetWidth && targetWidth !== meta.width) {
    pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });
  }
  pipeline = pipeline.webp({
    quality: opts.quality,
    effort: 5,
    alphaQuality: opts.alpha ? 90 : 80
  });

  await pipeline.toFile(dst);
  const newSize = fs.statSync(dst).size;
  const oldSize = fs.statSync(srcPath).size;
  return { src: srcPath, dst, oldSize, newSize, ratio: newSize / oldSize };
}

async function main() {
  let totalIn = 0;
  let totalOut = 0;
  let processed = 0;
  let skipped = 0;
  for (const target of TARGETS) {
    const dirAbs = path.join(ROOT, target.dir);
    if (!fs.existsSync(dirAbs)) continue;
    const files = fs.readdirSync(dirAbs).filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()));
    for (const file of files) {
      const srcPath = path.join(dirAbs, file);
      try {
        const res = await processFile(srcPath, target);
        if (!res) continue;
        if (res.skipped) { skipped++; continue; }
        processed++;
        totalIn += res.oldSize;
        totalOut += res.newSize;
        const pct = ((1 - res.ratio) * 100).toFixed(1);
        console.log(`✓ ${path.relative(ROOT, res.src)}  ${(res.oldSize/1024).toFixed(0)}KB → ${(res.newSize/1024).toFixed(0)}KB (-${pct}%)`);
      } catch (err) {
        console.warn(`✗ ${path.relative(ROOT, srcPath)}: ${err.message}`);
      }
    }
  }
  console.log('---');
  console.log(`Processed: ${processed}, Skipped (up-to-date): ${skipped}`);
  if (processed > 0) {
    console.log(`Total: ${(totalIn/1024/1024).toFixed(1)}MB → ${(totalOut/1024/1024).toFixed(1)}MB (saved ${((totalIn-totalOut)/1024/1024).toFixed(1)}MB)`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
