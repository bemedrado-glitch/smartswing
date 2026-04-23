// @ts-check
/**
 * SmartSwing AI — Playwright visual regression config.
 *
 * Runs `toHaveScreenshot()` assertions against 10 representative pages at
 * mobile + desktop viewports. Baseline snapshots live at
 *   tests/visual/__screenshots__/
 * and are committed to git. On every PR the CI workflow (lighthouse/a11y's
 * cousin: .github/workflows/visual.yml) runs Playwright, diffs each new
 * screenshot against its baseline, and fails if any page drifts by more than
 * `maxDiffPixelRatio` (default 1%).
 *
 * Updating baselines (intentional visual change):
 *   npx playwright test --update-snapshots
 *   git add tests/visual/__screenshots__/
 *
 * Why these defaults:
 *  - `maxDiffPixelRatio: 0.01` tolerates font-smoothing + subpixel rendering
 *    differences between local macOS and CI Ubuntu, which would otherwise
 *    flake constantly.
 *  - Animations are disabled globally via a stylesheet injection in
 *    tests/visual/visual.spec.js so a running gradient or shimmer never
 *    makes two runs disagree.
 *  - Only Chromium by default — adding Firefox/WebKit triples baseline
 *    storage for marginal gain. Cross-browser can be a second workflow.
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  expect: {
    // Full-page screenshots of long marketing pages with many images + videos
    // regularly exceed the 5s default on slower CI runners. Give them 30s
    // before Playwright bails out.
    timeout: 30_000,
    toHaveScreenshot: {
      // 1% pixel-difference tolerance for font rendering across runners.
      maxDiffPixelRatio: 0.01,
      // Hard cap: even if ratio passes, more than 200 drifted pixels is a bug.
      maxDiffPixels: 200,
      // Disable the default "everything must match exactly" RGB comparison;
      // use `pixelmatch` threshold so anti-aliased edges don't flake.
      threshold: 0.2
    }
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    ignoreHTTPSErrors: true,
    // Consistent color scheme + locale so CI baselines never drift on
    // someone else's machine running in dark mode or es-MX.
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'mobile',
      // Use Chromium with an iPhone-14-sized viewport instead of the
      // `devices['iPhone 14']` preset (which would require WebKit). Lets the
      // CI workflow install only Chromium — smaller download, faster boot.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
          'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    }
  ],
  webServer: process.env.CI ? {
    command: 'npx serve@14 -l 8080 .',
    url: 'http://localhost:8080/index.html',
    timeout: 30_000,
    reuseExistingServer: false
  } : undefined
});
