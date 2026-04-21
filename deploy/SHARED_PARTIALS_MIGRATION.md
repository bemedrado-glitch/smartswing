# Shared Footer Migration Guide (M2 from audit)

Previously, **30+ HTML pages each hand-rolled their own `<footer>`**. Every copy change had to be mirrored across all of them, which caused drift — stale copy on older pages, accessibility regressions, missing social links.

This migration introduces `shared-footer.js` — a tiny script that injects the canonical footer into any page with a mount div.

## Pattern

Replace this in every page:

```html
<footer class="footer" role="contentinfo" aria-label="Site footer">
  <div class="page">
    <!-- 60 lines of footer HTML -->
  </div>
</footer>
```

With this:

```html
<!-- Shared footer — content lives in shared-footer.js -->
<div id="ss-footer-mount" data-footer-variant="default"></div>

<!-- ... other scripts ... -->
<script src="./shared-footer.js"></script>
```

## Variants

Pick via `data-footer-variant`:

| Variant | Use case | What you get |
|---|---|---|
| `default` | Marketing pages (index, features, pricing, for-*, blog, contact, policy pages) | Full 4-column footer with Product / For You / Trust & Legal links, tagline, copyright, bottom links |
| `minimal` | Auth + app pages (login, signup, dashboard, analyze, checkout, settings) | Just © + Privacy/Terms/Cookies links |
| `none` | Pages with unique footer requirements | Script skips injection |

## Migration Checklist (per page)

1. Locate the existing `<footer class="footer">` block (look for `grep -n "footer" page.html`)
2. Replace the entire `<footer>…</footer>` with the mount div + `data-footer-variant` of your choice
3. Add `<script src="./shared-footer.js"></script>` before `</body>` (after other scripts)
4. Verify in a browser — footer should render identically
5. Run `npm test` to confirm no assertion failures
6. Commit the single-page migration as its own PR (small, reviewable)

## Pages already migrated

- ✅ `accessibility.html` (reference implementation — start here to see the pattern)

## Pages NOT yet migrated (for future PRs)

Marketing: `index.html`, `features.html`, `pricing.html`, `how-it-works.html`, `about.html`, `blog.html`, `contact.html`, `for-players.html`, `for-coaches.html`, `for-clubs.html`, `for-parents.html`, `pickleball.html`

Policy: `privacy-policy.html`, `user-agreement.html`, `refund-policy.html`, `cookie-policy.html`, `brand-policy.html`, `copyright-policy.html`, `california-privacy.html`

Auth + app: `login.html`, `signup.html`, `dashboard.html`, `analyze.html`, `checkout.html`, `cart.html`, `settings.html`, `coach-dashboard.html`, `library.html`, `welcome.html`, `payment-success.html`, `payment-cancelled.html`, `refer-friends.html`

Auth: `login.html`, `signup.html`, `auth-callback.html`

**Recommendation:** migrate 3-5 pages per PR (low-review-burden), starting with the most-referenced ones (index → features → pricing → how-it-works).

## How to change the footer content going forward

1. Edit `shared-footer.js` → `defaultFooter()` or `minimalFooter()` function
2. Deploy
3. All migrated pages show the new footer immediately

No more search-and-replace across 30 files.

## Troubleshooting

- **Footer doesn't appear:** check browser DevTools for JS errors; verify `<script src="./shared-footer.js">` is present and loads after `DOMContentLoaded`
- **i18n strings not translating:** `shared-footer.js` calls `window.i18n.applyTranslations()` after injection; ensure i18n.js loads BEFORE shared-footer.js
- **Layout shift on load:** the mount div is empty until JS runs. If this is visually disruptive, give the mount a `min-height` matching the footer height
