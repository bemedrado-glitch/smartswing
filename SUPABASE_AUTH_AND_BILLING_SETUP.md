# Supabase Auth And Billing Setup

This project already contains the application code for:

- email/password sign in and account creation
- Google, Apple, and Meta OAuth through Supabase Auth
- browser autofill-friendly profile fields for name, phone, and address
- Stripe checkout for monthly and yearly plans
- Stripe billing portal for cancel-anytime subscription management
- Supabase profile and `customer_subscriptions` persistence

## 1. Apply the Supabase schema

Run the existing migrations in order:

- `supabase/migrations/20260319_smartswing_core.sql`
- `supabase/migrations/20260319_smartswing_sync_extensions.sql`
- `supabase/migrations/20260319_smartswing_retention_loop.sql`
- `supabase/migrations/20260320_smartswing_access_guardrails.sql`
- `supabase/migrations/20260320_smartswing_training_recommendations.sql`
- `supabase/migrations/20260324_smartswing_billing_and_profiles.sql`

Important tables already included:

- `public.profiles`
- `public.customer_subscriptions`

Important subscription fields already included:

- `subscription_tier`
- `subscription_status`
- `billing_interval`
- `stripe_customer_id`
- `stripe_subscription_id`
- `billing_period_end`
- `subscription_cancel_at_period_end`
- `subscription_canceled_at`

## 2. Configure Supabase Auth

In the Supabase dashboard:

1. Enable Email authentication.
2. Enable OAuth providers:
   - Google
   - Apple
   - Facebook
3. Add the production redirect URL:
   - `https://www.smartswingai.com/auth-callback.html`
4. Add your local redirect URL for development if needed:
   - `http://localhost:8000/auth-callback.html`

The project already creates a `profiles` row when a new `auth.users` record is inserted via the trigger in `20260319_smartswing_core.sql`.

## 3. Publish client-side Supabase config

The site now loads public runtime config from `api/runtime-config.js`, which reads deployment environment variables. Keep `public-app-config.js` as an empty-safe fallback and set real values in the hosting environment instead.

Required public environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true
NEXT_PUBLIC_OAUTH_APPLE_ENABLED=true
NEXT_PUBLIC_OAUTH_FACEBOOK_ENABLED=true
```

Without these values:

- email/password falls back to local demo behavior
- Google/Apple/Meta OAuth is disabled in the UI
- cloud profile sync is not available

## 4. Configure Stripe subscription products

Create Stripe recurring prices for:

- `starter` monthly
- `starter` yearly
- `pro` monthly
- `pro` yearly
- `elite` monthly
- `elite` yearly

Yearly prices should reflect the 15% discount already used by the app:

- Player: `$9.99/mo` or `$101.90/year`
- Performance: `$19.99/mo` or `$203.90/year`
- Tournament Pro: `$49.99/mo` or `$509.90/year`

## 5. Set server environment variables

Set these in the deployment environment:

```bash
PUBLIC_APP_URL=https://www.smartswingai.com

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true
NEXT_PUBLIC_OAUTH_APPLE_ENABLED=true
NEXT_PUBLIC_OAUTH_FACEBOOK_ENABLED=true

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_ELITE_MONTHLY=price_...
STRIPE_PRICE_ELITE_YEARLY=price_...
```

## 6. Verify cancel-anytime behavior

Cancel-anytime is already implemented through Stripe Billing Portal:

- client entry point: `settings.html`
- app helper: `app-data.js -> createStripeBillingPortal()`
- API endpoint: `api/create-billing-portal-session.js`

Expected behavior:

- monthly plans can be canceled anytime
- yearly plans can also be canceled anytime
- yearly access remains active until the end of the paid annual term
- Stripe webhooks update Supabase with `cancel_at_period_end` and `canceled_at`

## 7. Verify subscription storage

These flows already persist subscription data:

- `api/create-checkout-session.js`
- `api/checkout-session-status.js`
- `api/stripe-webhook.js`

Supabase writes occur in:

- `public.profiles`
- `public.customer_subscriptions`

## 8. Recommended production checks

Before launch, verify:

1. Email signup creates an `auth.users` row and matching `profiles` row.
2. Google, Apple, and Meta OAuth return to `auth-callback.html`.
3. Buying a monthly plan stores:
   - `subscription_tier`
   - `subscription_status`
   - `billing_interval=monthly`
4. Buying a yearly plan stores:
   - `billing_interval=yearly`
   - correct annual Stripe price id
5. Billing portal cancellation updates:
   - `subscription_cancel_at_period_end`
   - `subscription_canceled_at`
6. `customer_subscriptions` contains one current Stripe-backed row per student account.
