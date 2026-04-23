// @ts-check
/**
 * SmartSwing AI — Visual regression snapshot suite.
 *
 * Captures full-page screenshots of 10 representative pages at two viewports
 * (desktop + mobile, configured in playwright.config.js). Each snapshot is
 * compared against a committed baseline in `tests/visual/__screenshots__/`.
 *
 * What this catches that Lighthouse + axe do not:
 *   - A CSS rule that silently breaks layout on 30 pages
 *   - A brand-token change that muddies contrast on one tier but not another
 *   - A refactor that drops visible content (like the internal footer links
 *     regression user just reported)
 *   - Font-loading race conditions where text renders twice
 *
 * Stability tricks applied per page:
 *   1. Animations disabled globally — `*, *::before, *::after` get
 *      `animation: none !important; transition: none !important`
 *   2. Fonts are awaited with `document.fonts.ready` so no half-loaded
 *      fallback text leaks into the screenshot
 *   3. <video> elements masked — autoplay would make them non-deterministic
 *   4. `prefers-reduced-motion: reduce` forced so any motion-gated UI stays
 *      in its resting state
 *   5. Small scroll warmup + wait for network idle so lazy-loaded images
 *      below the fold finish before we snap
 *
 * Updating baselines when a visual change is intentional:
 *   npx playwright test --update-snapshots
 *   git add tests/visual/__screenshots__/
 */

const { test, expect } = require('@playwright/test');

// Representative page inventory. Covers every distinct chrome pattern
// (public marketing, pricing, legal, auth, footer-less utility) so a
// regression on any pattern shows up in at least one screenshot.
const PAGES = [
  { name: 'home',        url: '/index.html' },
  { name: 'pricing',     url: '/pricing.html' },
  { name: 'for-players', url: '/for-players.html' },
  { name: 'how-it-works',url: '/how-it-works.html' },
  { name: 'about',       url: '/about.html' },
  { name: 'contact',     url: '/contact.html' },
  { name: 'blog',        url: '/blog.html' },
  { name: 'login',       url: '/login.html' },
  { name: 'signup',      url: '/signup.html' },
  { name: '404',         url: '/404.html' }
];

/** Apply all stability hooks so screenshots are deterministic. */
async function prepare(page) {
  // Kill every transition/animation so a CSS shimmer can't desync runs.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `
  });

  // Wait for web fonts so the screenshot doesn't include FOUT.
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });

  // Give lazy-loaded below-the-fold images a beat to land.
  await page.waitForLoadState('networkidle').catch(() => {});
}

for (const page of PAGES) {
  test(`visual — ${page.name}`, async ({ page: pw }) => {
    // emulateMedia forces reduced-motion + dark color scheme across runs.
    await pw.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await pw.goto(page.url, { waitUntil: 'domcontentloaded' });
    await prepare(pw);

    // Mask videos (autoplay makes frame timing non-deterministic) and any
    // element flagged with data-test-nondeterministic for dates/counters.
    const mask = [
      pw.locator('video'),
      pw.locator('[data-test-nondeterministic]'),
      pw.locator('.hero-visual-video'),
      pw.locator('#scoreArc') // animated SVG progress stroke
    ];

    await expect(pw).toHaveScreenshot(`${page.name}.png`, {
      fullPage: true,
      mask,
      // Animations are already off via stylesheet; belt-and-braces here.
      animations: 'disabled'
    });
  });
}
