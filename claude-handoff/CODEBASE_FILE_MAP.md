# Codebase File Map

## 1. Marketing and SEO pages

- `index.html` - main homepage and primary acquisition page
- `features.html` - product capability and proof page
- `how-it-works.html` - process explanation page
- `pricing.html` - plan comparison and billing entry point
- `for-players.html` - player-specific landing page
- `for-coaches.html` - coach-specific landing page
- `for-clubs.html` - club-specific landing page
- `for-parents.html` - parent-specific landing page
- `blog.html` - blog landing page
- `contact.html` - support, sales, and onboarding contact page
- `about.html` - company/about page
- `pickleball.html` - pickleball early-access capture page
- `robots.txt`, `sitemap.xml` - search discovery support

## 2. Product app pages

- `analyze.html` - core analysis experience
- `dashboard.html` - player dashboard
- `coach-dashboard.html` - coach workspace
- `library.html` - drills and tactics library
- `settings.html` - account and billing management
- `welcome.html` - post-signup landing page

## 3. Auth and onboarding

- `signup.html` - create account
- `login.html` - sign in
- `auth-callback.html` - OAuth callback and session restoration
- `public-app-config.js` - static runtime public config fallback
- `public-app-config.example.js` - example config
- `api/runtime-config.js` - environment-backed runtime config script

## 4. Billing and conversion

- `cart.html` - pre-checkout intent state
- `checkout.html` - Stripe-hosted checkout entry page
- `payment-success.html` - post-checkout verification
- `payment-cancelled.html` - cancelled checkout state
- `pricing.html` - plan selection surface

## 5. Shared frontend logic

- `app-data.js` - main SmartSwing shared store and business logic
- `analytics.js` - Vercel analytics gated by cookie consent
- `site-experience.js` - CTA and cookie UX helpers
- `growth-forms.js` - waitlist and lead-capture helper
- `growth-pages.css` - shared styles for audience pages
- `policy-pages.css` - shared styles for policy pages
- `pwa.js`, `sw.js`, `manifest.json` - PWA support

## 6. Analysis engine and sports logic

- `analyze.html` - UI and report-generation shell
- `advanced-biomechanics-engine.js` - biomechanics calculations
- `improved-pose-detection.js` - pose-detection support
- `assets/vendor/mediapipe/pose/*` - MediaPipe pose runtime assets
- `assets/vendor/tf.min.js` - TensorFlow runtime asset
- `assets/vendor/pose-detection.min.js` - pose-detection runtime asset

## 7. Data, auth, and sync backend

- `api/_lib/stripe-common.js` - shared billing helpers and Supabase REST sync helpers
- `api/create-checkout-session.js` - create Stripe checkout session
- `api/checkout-session-status.js` - verify checkout completion
- `api/create-billing-portal-session.js` - launch Stripe billing portal
- `api/stripe-webhook.js` - webhook ingestion and profile/subscription sync
- `api/runtime-config.js` - public runtime env injection for frontend auth/payment config

## 8. Database and migrations

- `supabase/migrations/*.sql` - canonical incremental schema changes
- `smartswing-database.sql` - broader database snapshot
- `supabase-schema-update.sql` - supplementary schema update script

## 9. Testing and release

- `tests/run-tests.ps1` - local smoke suite
- `tests/run-analyzer-batch-tests.ps1` - batch analyzer scenario validation
- `tests/README.md` - test instructions
- `deploy/build-release.ps1` - release packaging script

## 10. GitHub and deployment automation

- `.github/workflows/ci.yml` - smoke test workflow
- `.github/workflows/deploy-vercel.yml` - Vercel deploy workflow
- `package.json` - main commands
- `serve.ps1` - local static server for development
- `vercel.json` - routes, redirects, headers, and noindex rules

## 11. Legal and compliance pages

- `privacy-policy.html`
- `accessibility.html`
- `user-agreement.html`
- `refund-policy.html`
- `cookie-policy.html`
- `copyright-policy.html`
- `brand-policy.html`
- `california-privacy.html`

## 12. Operational documentation already in repo

These are not the new handoff docs, but they remain useful background:

- `README.md`
- `MASTER-FILE-INDEX.md`
- `FEATURES-DOCUMENTATION.md`
- `TESTING-DEPLOYMENT-GUIDE.md`
- `SECURE-SETUP-GUIDE.md`
- `SUPABASE-COMPLETE-INTEGRATION.md`
- `SUPABASE_AUTH_AND_BILLING_SETUP.md`
- `deploy/STRIPE_PRODUCTION_SETUP.md`

## 13. What Claude should usually inspect first

For most future feature work, start with:

1. `app-data.js`
2. the specific page file being changed
3. related `api/*.js` file if billing or runtime config is involved
4. related `supabase/migrations/*.sql` file if schema changes are needed
