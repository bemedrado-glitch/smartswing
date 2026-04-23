# Visual regression tests

Playwright captures a pixel-level snapshot of 10 representative pages at
desktop + mobile viewports and compares each against a committed baseline
on every PR. If any page drifts by more than 1% of pixels, CI fails.

## Baseline storage

Committed PNGs live at `tests/visual/__screenshots__/visual.spec.js/`.
Filenames encode the test name + project (desktop/mobile) + platform.

## First run (bootstrapping baselines)

The CI workflow runs with `--update-snapshots=missing`, which writes new
baselines the first time any page/viewport is added to the suite. If you
see a workflow annotation saying "new baseline screenshots were written,"
that means CI auto-generated a baseline that needs to be committed to the
repo. Run the command below locally and commit the PNGs.

## Running locally

```bash
# First-time setup
npm install
npx playwright install --with-deps chromium

# Boot the static server in one terminal
npm run start
# In another terminal, run the suite
npm run test:visual
```

## Updating baselines (when a visual change is intentional)

```bash
# From the feature branch
npx playwright test --update-snapshots
# Verify the diffs look right, then
git add tests/visual/__screenshots__/
git commit -m "chore(visual): update baselines for <feature>"
```

Do NOT update baselines without eyeballing the changed PNGs — that defeats
the whole point.

## What it catches (and what it misses)

Catches:
- CSS refactor that breaks 30 pages silently
- Token-color change that muddies contrast on one tier
- Visible content that disappears (like the internal footer links
  regression in PR #105 → fixed in PR #114)
- Font-loading race conditions where text renders twice

Misses:
- Behavior bugs (those are `functional-tests.js`)
- Accessibility violations (those are `a11y.yml` / axe-core)
- Performance regressions (those are `lighthouse.yml`)

Together, these four workflows gate every PR on measurable quality.

## Stability tricks applied

See comments in `visual.spec.js`. TL;DR:
- Animations + transitions killed via stylesheet injection
- Web fonts awaited with `document.fonts.ready`
- Reduced-motion forced via `page.emulateMedia()`
- Videos + animated SVGs masked
- Network idle awaited so lazy images finish loading
