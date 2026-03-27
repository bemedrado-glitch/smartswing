# Stripe Production Setup

Use this setup for SmartSwing recurring billing now that the public site and app are served from Vercel.

## Required Vercel environment variables

- `PUBLIC_APP_URL`
  - `https://www.smartswingai.com`
- `STRIPE_SECRET_KEY`
  - Stripe secret key for the correct mode (`sk_test_...` first, then `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET`
  - webhook signing secret from the Stripe endpoint below
- `STRIPE_PRICE_STARTER_MONTHLY`
  - Stripe `price_...` id for the Player `$9.99/month` plan
- `STRIPE_PRICE_STARTER_YEARLY`
  - Stripe `price_...` id for the Player `$101.90/year` plan
- `STRIPE_PRICE_PRO_MONTHLY`
  - Stripe `price_...` id for the Performance `$19.99/month` plan
- `STRIPE_PRICE_PRO_YEARLY`
  - Stripe `price_...` id for the Performance `$203.90/year` plan
- `STRIPE_PRICE_ELITE_MONTHLY`
  - Stripe `price_...` id for the Tournament Pro `$49.99/month` plan
- `STRIPE_PRICE_ELITE_YEARLY`
  - Stripe `price_...` id for the Tournament Pro `$509.90/year` plan

## Optional but recommended Vercel environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

These let Stripe checkout verification and webhooks update `profiles.subscription_tier`, `profiles.subscription_status`, `profiles.stripe_customer_id`, `profiles.stripe_subscription_id`, `profiles.billing_interval`, `profiles.subscription_cancel_at_period_end`, and `profiles.billing_period_end` automatically.

## Stripe product and price mapping

Create these recurring prices in Stripe:

- Player
  - `$9.99/month`
  - env: `STRIPE_PRICE_STARTER_MONTHLY`
  - `$101.90/year`
  - env: `STRIPE_PRICE_STARTER_YEARLY`
- Performance
  - `$19.99/month`
  - env: `STRIPE_PRICE_PRO_MONTHLY`
  - `$203.90/year`
  - env: `STRIPE_PRICE_PRO_YEARLY`
- Tournament Pro
  - `$49.99/month`
  - env: `STRIPE_PRICE_ELITE_MONTHLY`
  - `$509.90/year`
  - env: `STRIPE_PRICE_ELITE_YEARLY`

## Webhook endpoint

Create a Stripe webhook endpoint pointing to:

- `https://www.smartswingai.com/api/stripe-webhook`

For self-service plan cancellation and payment-method updates, SmartSwing also uses Stripe Billing Portal through:

- `https://www.smartswingai.com/api/create-billing-portal-session`

Subscribe to at least these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the generated signing secret into:

- `STRIPE_WEBHOOK_SECRET`

## Production flow

1. Customer chooses a paid plan in SmartSwing.
2. `checkout.html` calls `/api/create-checkout-session`.
3. Vercel creates a Stripe hosted Checkout Session.
4. Customer pays in Stripe Checkout.
5. Stripe returns to:
   - `https://www.smartswingai.com/payment-success.html?provider=stripe&session_id=...`
6. The app verifies the session through `/api/checkout-session-status`.
7. If Supabase service-role credentials are present, cloud billing state is updated immediately.
8. Webhooks keep the subscription status synced after renewals, failures, cancellations, and tier changes.
9. Customers can open the Stripe billing portal from `settings.html` to cancel anytime or update payment details.

## Test mode checklist

1. Add all test env vars in Vercel.
2. Redeploy.
3. Create the webhook endpoint in Stripe test mode.
4. Use a Stripe test card in checkout.
5. Confirm:
   - checkout opens from `checkout.html`
   - `payment-success.html` verifies the session
   - plan updates locally
   - Supabase profile updates if service-role env vars are present

## Notes

- The app uses hosted Stripe Checkout, so a Stripe publishable key is not required for the current flow.
- Apple Pay, Google Pay, and Link appear inside Stripe Checkout when Stripe and the browser/device support them.
- Do not expose `STRIPE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in any client-side file.
