# Website Architecture

## 1. Current stack

SmartSwing AI currently runs as a static multi-page website with shared vanilla JavaScript state and a small serverless backend.

- Frontend: HTML, CSS, vanilla JS
- Hosting: Vercel
- Server functions: Vercel `/api/*.js`
- Auth/data/storage: Supabase
- Billing: Stripe-hosted checkout + billing portal
- Source control and automation: GitHub + GitHub Actions

This is a web-first product. There is no SPA framework, no bundler-driven app shell, and no React/Next runtime in the current implementation.

## 2. Frontend composition

The frontend is organized by page, with shared business logic centralized in `app-data.js`.

Core shared files:

- `app-data.js`
  - Main client-side store exposed as `window.SmartSwingStore`
  - Plan definitions, auth helpers, billing helpers, library data, syncing, dashboards, messaging, goals, drills, and persistence
- `analytics.js`
  - Loads Vercel Web Analytics only after cookie consent
- `site-experience.js`
  - Shared plan-intent, CTA, and cookie-banner behavior
- `growth-forms.js`
  - Lead capture for pages like pickleball waitlist
- `public-app-config.js`
  - Static runtime fallback for public config
- `api/runtime-config.js`
  - Preferred runtime config injector from environment variables
- `pwa.js`, `sw.js`, `manifest.json`
  - PWA support

## 3. Page architecture

There are three main page groups.

Marketing and acquisition:

- `index.html`
- `features.html`
- `how-it-works.html`
- `pricing.html`
- `for-players.html`
- `for-coaches.html`
- `for-clubs.html`
- `for-parents.html`
- `blog.html`
- `contact.html`
- `pickleball.html`
- legal and policy pages

Product and account pages:

- `signup.html`
- `login.html`
- `auth-callback.html`
- `welcome.html`
- `dashboard.html`
- `coach-dashboard.html`
- `settings.html`
- `library.html`

Conversion and billing pages:

- `cart.html`
- `checkout.html`
- `payment-success.html`
- `payment-cancelled.html`

Analysis engine:

- `analyze.html`
- `advanced-biomechanics-engine.js`
- `improved-pose-detection.js`
- MediaPipe and pose assets under `assets/vendor/`

## 4. Shared state model

`app-data.js` is the real application core.

It manages:

- users and sessions
- localStorage persistence
- Supabase auth/session restoration
- plan access and report limits
- drills and tactics libraries
- assessments and performance snapshots
- coach sessions and messaging
- goals, progress events, and retention
- checkout intent and Stripe checkout state
- cloud sync to Supabase

The app deliberately supports two modes:

- Cloud mode: Supabase configured through runtime config
- Local fallback mode: browser-only data for demo/preview/offline-style use

That local fallback is important. Many pages keep working even when Supabase is not configured.

## 5. Auth architecture

Auth is built around Supabase Auth.

Primary files:

- `signup.html`
- `login.html`
- `auth-callback.html`
- `app-data.js`
- `public-app-config.js`
- `api/runtime-config.js`

Flow:

1. Public runtime config loads.
2. `app-data.js` creates a Supabase client if config exists.
3. Email/password or OAuth sign-in begins.
4. OAuth returns through `auth-callback.html`.
5. The session is restored and the app routes the user to the right post-auth destination.

## 6. Data architecture

Supabase covers database and storage.

Main table families from migrations:

- profiles and auth bootstrap
- assessments
- coach_sessions
- contact_messages
- player_goals
- progress_events
- drill_assignments
- analysis_reports
- shot_benchmarks
- coach_player_links
- inbox_messages
- report_usage_monthly
- training_resources
- user_training_progress
- training_recommendations
- customer_subscriptions
- content libraries:
  - drill_library
  - tactic_library

Storage usage in the frontend:

- `tennis-videos` bucket
- `analysis-reports` bucket

The schema is defined incrementally in `supabase/migrations/*.sql`, with broader snapshots also in:

- `smartswing-database.sql`
- `supabase-schema-update.sql`

## 7. Billing architecture

Billing uses Stripe-hosted checkout rather than embedded card UI.

Frontend files:

- `pricing.html`
- `cart.html`
- `checkout.html`
- `payment-success.html`
- `payment-cancelled.html`
- `settings.html`
- `app-data.js`

Serverless files:

- `api/create-checkout-session.js`
- `api/checkout-session-status.js`
- `api/create-billing-portal-session.js`
- `api/stripe-webhook.js`
- `api/_lib/stripe-common.js`

Flow:

1. User selects a plan.
2. The app saves checkout intent in local storage.
3. `checkout.html` requests a Stripe checkout session from Vercel.
4. Stripe handles payment.
5. User returns to `payment-success.html`.
6. The app verifies the checkout session.
7. Supabase profile and `customer_subscriptions` can be updated immediately.
8. Webhooks keep subscription state in sync after renewals, failures, and cancellations.

## 8. Deployment architecture

Vercel serves both static pages and serverless APIs.

Key files:

- `vercel.json`
- `_headers`
- `robots.txt`
- `sitemap.xml`
- `.vercelignore`
- `.github/workflows/deploy-vercel.yml`

`vercel.json` handles:

- redirects from legacy routes
- global security headers
- `noindex` headers for internal app routes

## 9. Testing and release

Key files:

- `tests/run-tests.ps1`
- `tests/run-analyzer-batch-tests.ps1`
- `.github/workflows/ci.yml`
- `deploy/build-release.ps1`

The current test strategy is a PowerShell smoke suite that:

- starts a local server
- checks core pages and assets
- validates important UI markers
- validates key analyzer logic markers
- runs batch analyzer scenarios

## 10. Practical continuation guidance

If continuing this product in Claude Code, the highest-leverage files are:

- `app-data.js`
- `analyze.html`
- `dashboard.html`
- `coach-dashboard.html`
- `checkout.html`
- `pricing.html`
- `signup.html`
- `login.html`
- `api/*.js`
- `supabase/migrations/*.sql`

Avoid assuming a framework migration is already in place. The current architecture is intentionally simple: static pages, shared client store, Vercel serverless APIs, Supabase, and Stripe.
