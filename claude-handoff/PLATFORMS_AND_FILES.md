# Platforms Used And Files For Each

## Vercel

Used for:

- static hosting of the website
- serverless API execution
- redirects and security headers
- production deployment target
- Vercel Analytics

Primary files:

- `vercel.json`
- `_headers`
- `.vercelignore`
- `analytics.js`
- `api/runtime-config.js`
- `api/create-checkout-session.js`
- `api/checkout-session-status.js`
- `api/create-billing-portal-session.js`
- `api/stripe-webhook.js`
- `api/_lib/stripe-common.js`
- `.github/workflows/deploy-vercel.yml`

Notes:

- `vercel.json` handles legacy route redirects and internal-page `noindex` rules.
- Vercel is also where production environment variables need to be configured.

## Supabase

Used for:

- authentication
- Postgres database
- row-level security policies
- storage for reports and uploaded videos
- profile and subscription sync

Primary runtime files:

- `app-data.js`
- `signup.html`
- `login.html`
- `auth-callback.html`
- `settings.html`
- `dashboard.html`
- `public-app-config.js`
- `public-app-config.example.js`
- `api/runtime-config.js`
- `.env.example`

Primary schema and migration files:

- `supabase/migrations/20260319_smartswing_core.sql`
- `supabase/migrations/20260319_smartswing_content_library.sql`
- `supabase/migrations/20260319_smartswing_retention_loop.sql`
- `supabase/migrations/20260319_smartswing_sync_extensions.sql`
- `supabase/migrations/20260320_smartswing_access_guardrails.sql`
- `supabase/migrations/20260320_smartswing_training_recommendations.sql`
- `supabase/migrations/20260324_smartswing_billing_and_profiles.sql`
- `smartswing-database.sql`
- `supabase-schema-update.sql`

Support docs:

- `SUPABASE-COMPLETE-INTEGRATION.md`
- `SUPABASE_AUTH_AND_BILLING_SETUP.md`
- `GITHUB-SUPABASE-CONNECT.md`

Important tables visible from migrations:

- `profiles`
- `assessments`
- `coach_sessions`
- `contact_messages`
- `player_goals`
- `progress_events`
- `drill_assignments`
- `analysis_reports`
- `shot_benchmarks`
- `coach_player_links`
- `inbox_messages`
- `report_usage_monthly`
- `training_resources`
- `user_training_progress`
- `training_recommendations`
- `customer_subscriptions`
- `drill_library`
- `tactic_library`

Important storage buckets referenced by the app:

- `tennis-videos`
- `analysis-reports`

## Stripe

Used for:

- subscription checkout
- recurring billing
- checkout verification
- webhook-driven subscription sync
- self-service billing portal

Primary files:

- `api/create-checkout-session.js`
- `api/checkout-session-status.js`
- `api/create-billing-portal-session.js`
- `api/stripe-webhook.js`
- `api/_lib/stripe-common.js`
- `checkout.html`
- `pricing.html`
- `payment-success.html`
- `payment-cancelled.html`
- `settings.html`
- `app-data.js`
- `.env.example`
- `deploy/STRIPE_PRODUCTION_SETUP.md`

Required environment variables are documented in:

- `.env.example`
- `deploy/STRIPE_PRODUCTION_SETUP.md`

## GitHub

Used for:

- source control
- CI smoke tests
- deploy automation into Vercel

Primary files:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vercel.yml`
- `package.json`
- `tests/run-tests.ps1`
- `deploy/build-release.ps1`

Notes:

- CI currently runs a PowerShell smoke suite.
- Deploy workflow uses the Vercel CLI.

## Browser local storage

Used for:

- offline/demo fallback mode
- session persistence
- checkout intent
- growth lead capture
- local copies of assessments, goals, messages, drills, and progress

Primary files:

- `app-data.js`
- `growth-forms.js`
- `site-experience.js`

Important local storage concerns:

- This fallback mode is intentional and should not be removed casually.
- Many product flows degrade into browser-only mode if Supabase config is absent.

## PWA/browser platform support

Used for:

- installable manifest
- service worker
- app-like experience

Primary files:

- `manifest.json`
- `pwa.js`
- `sw.js`

## Legacy Wix bridge files

Used for:

- migration and redirect support from older Wix surfaces
- public-site redirect helpers
- pricing bridge utilities

Primary files:

- `deploy/export-wix-html.ps1`
- `deploy/install-wix-public-redirect.ps1`
- `deploy/wix-embed-snippet.html`
- `deploy/wix-pricing-plan-bridge-page.js`
- `deploy/wix-public-site-redirect.js`
- `deploy/WIX-PUBLISH.md`
- `deploy/WIX_PRICING_PLANS_BRIDGE_SETUP.md`

These are not the primary production runtime, but they matter as historical integration context.
