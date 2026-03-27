# SmartSwing AI — Claude Code Project Guide

## Project Overview

SmartSwing AI is a multi-page static website + serverless API serving as an AI-powered tennis/pickleball swing analysis platform. Users record swings, get biomechanics AI feedback, and subscribe to coaching plans.

**Stack:**
- Frontend: HTML + CSS + vanilla JS (no React/Next.js)
- Hosting & Serverless: Vercel
- Auth + DB + Storage: Supabase
- Payments: Stripe (hosted checkout + webhooks)
- CI/CD: GitHub Actions → Vercel

## Architecture

### Shared State
All client-side state lives in `window.SmartSwingStore` defined in `app-data.js`. This is the central bus — read it before touching any page logic.

### Auth Flow
1. `signup.html` / `login.html` → Supabase OAuth/email
2. `auth-callback.html` handles the redirect
3. `public-app-config.js` + `api/runtime-config.js` provide keys at runtime
4. **Local browser fallback**: if Supabase config is missing, the app degrades gracefully into demo mode — do NOT remove this

### Payment Flow
`pricing.html` → `checkout.html` → `api/create-checkout-session.js` → Stripe hosted checkout → `payment-success.html` / `payment-cancelled.html`. Subscription state is synced via `api/stripe-webhook.js` AND on redirect verification.

### Key Directories
| Path | Purpose |
|------|---------|
| `api/` | Vercel serverless functions (Stripe + runtime config) |
| `supabase/migrations/` | All DB schema migrations |
| `deploy/` | Wix bridge scripts, Stripe setup docs, build helpers |
| `claude-handoff/` | Architecture docs and codebase snapshot for cold starts |
| `assets/` | Static images and media |

## Connected Platforms & MCP Tools

### Vercel (hosting + serverless)
- Deploy: use `mcp__1aeb083b__deploy_to_vercel` or `mcp__1aeb083b__list_deployments`
- Check logs: `mcp__1aeb083b__get_runtime_logs` / `mcp__1aeb083b__get_deployment_build_logs`
- Key files: `vercel.json`, `_headers`, `.vercelignore`, `api/runtime-config.js`

### Supabase (auth + DB + storage)
- Run SQL: `mcp__31c1c9ee__execute_sql`
- Apply migrations: `mcp__31c1c9ee__apply_migration`
- Check tables: `mcp__31c1c9ee__list_tables`
- Key files: `app-data.js`, `auth-callback.html`, `supabase/migrations/`
- Storage buckets: `tennis-videos`, `analysis-reports`

### Stripe (billing)
- List products/prices: `mcp__3b06dba4__list_products`, `mcp__3b06dba4__list_prices`
- Check subscriptions: `mcp__3b06dba4__list_subscriptions`
- Key files: `api/create-checkout-session.js`, `api/stripe-webhook.js`, `api/_lib/stripe-common.js`

### GitHub (CI/CD)
- Workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy-vercel.yml`
- Tests: `tests/` (PowerShell smoke suite via `npm test`)

## Working Rules

1. **Never rewrite to a framework** — this is intentionally vanilla HTML/JS/CSS
2. **Preserve SmartSwingStore patterns** unless a refactor is explicitly requested
3. **Keep the local browser fallback** — it's intentional, not a bug
4. **Run `npm test`** after meaningful changes
5. **Edit existing files** — don't create new pages unless explicitly asked
6. **Vercel, Stripe, and Supabase integrations** must stay intact

## Key Files to Know First

Before changing anything significant, read:
1. `claude-handoff/WEBSITE_ARCHITECTURE.md`
2. `claude-handoff/CUSTOMER_JOURNEY_AND_NAVIGATION.md`
3. `claude-handoff/PLATFORMS_AND_FILES.md`
4. `app-data.js` (SmartSwingStore)
5. `public-app-config.js` (runtime keys)

## Page Inventory

**Public marketing:** `index.html`, `features.html`, `pricing.html`, `how-it-works.html`, `about.html`, `blog.html`, `contact.html`

**Audience pages:** `for-players.html`, `for-coaches.html`, `for-clubs.html`, `for-parents.html`, `pickleball.html`

**Auth:** `signup.html`, `login.html`, `auth-callback.html`, `welcome.html`

**App (authenticated):** `dashboard.html`, `analyze.html`, `library.html`, `settings.html`, `coach-dashboard.html`

**Payments:** `checkout.html`, `cart.html`, `payment-success.html`, `payment-cancelled.html`

**Legal/policy:** `privacy-policy.html`, `user-agreement.html`, `accessibility.html`, `cookie-policy.html`, `brand-policy.html`, `copyright-policy.html`, `california-privacy.html`, `refund-policy.html`

**Growth:** `refer-friends.html`, `growth-forms.js`, `growth-pages.css`

## Environment Variables

See `.env.example` for required vars. Production vars live in Vercel dashboard. Never commit real secrets.

## Supabase Tables

`profiles`, `assessments`, `coach_sessions`, `contact_messages`, `player_goals`, `progress_events`, `drill_assignments`, `analysis_reports`, `shot_benchmarks`, `coach_player_links`, `inbox_messages`, `report_usage_monthly`, `training_resources`, `user_training_progress`, `training_recommendations`, `customer_subscriptions`, `drill_library`, `tactic_library`
