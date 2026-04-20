#!/usr/bin/env node
/**
 * Static accessibility audit using axe-core + jsdom.
 * Runs against the HTML files in the repo (not the deployed site).
 *
 * Usage: node tools/a11y-audit.js [file1.html file2.html ...]
 *        node tools/a11y-audit.js                    # audit default page set
 *
 * Output: JSON-shaped per-page summary to stdout.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const axeSource = fs.readFileSync(require.resolve('axe-core'), 'utf8');

const DEFAULT_PAGES = [
  'index.html',
  'signup.html',
  'login.html',
  'pricing.html',
  'features.html',
  'how-it-works.html',
  'about.html',
  'contact.html',
  'for-players.html',
  'for-coaches.html',
  'for-clubs.html',
  'for-parents.html',
  'pickleball.html',
  'analyze.html',
  'dashboard.html',
  'library.html',
  'settings.html',
  'welcome.html',
  'checkout.html',
  'payment-success.html',
  'payment-cancelled.html',
  'marketing.html',
  'coach-dashboard.html',
];

async function auditPage(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  // jsdom: don't run page scripts (they'd try to fetch /api/runtime-config.js etc.)
  const dom = new JSDOM(html, {
    url: 'https://smartswingai.com/' + path.basename(htmlPath),
    runScripts: 'outside-only',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // Inject axe
  window.eval(axeSource);
  // Run subset of rules that work without a real renderer
  // (skip color-contrast which needs computed styles + visual rendering)
  const results = await window.axe.run(window.document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'best-practice'],
    },
    rules: {
      // Disabled rules that need a real browser (computed styles, visual layout)
      'color-contrast': { enabled: false },
      'color-contrast-enhanced': { enabled: false },
      'target-size': { enabled: false },
      'meta-viewport-large': { enabled: false },
    },
  });
  dom.window.close();
  return {
    file: path.basename(htmlPath),
    violations: results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      sample: (v.nodes[0] && v.nodes[0].html ? v.nodes[0].html.slice(0, 240) : ''),
      sampleTarget: (v.nodes[0] && v.nodes[0].target ? v.nodes[0].target.join(' ') : ''),
    })),
    passes: results.passes.length,
    inapplicable: results.inapplicable.length,
  };
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const pages = args.length ? args : DEFAULT_PAGES;
  const summary = { total_pages: 0, total_violations: 0, by_severity: { critical: 0, serious: 0, moderate: 0, minor: 0 }, by_rule: {}, pages: [] };

  for (const page of pages) {
    const fullPath = path.isAbsolute(page) ? page : path.join(repoRoot, page);
    if (!fs.existsSync(fullPath)) {
      summary.pages.push({ file: page, error: 'file not found' });
      continue;
    }
    try {
      const result = await auditPage(fullPath);
      summary.total_pages++;
      summary.total_violations += result.violations.length;
      result.violations.forEach(v => {
        if (v.impact && summary.by_severity[v.impact] !== undefined) summary.by_severity[v.impact]++;
        summary.by_rule[v.id] = (summary.by_rule[v.id] || 0) + v.nodes;
      });
      summary.pages.push(result);
    } catch (e) {
      summary.pages.push({ file: page, error: e.message });
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
