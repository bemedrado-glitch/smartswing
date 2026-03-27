# Customer Journey And Navigation

## 1. Top-level navigation

The public navigation is centered around a free-analysis CTA and audience-specific pages.

Common public routes:

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

Common high-intent CTA:

- `analyze.html` via "Start Free Analysis"

## 2. Core customer journeys

### New player acquisition

Typical path:

`index.html` -> `features.html` or `how-it-works.html` -> `pricing.html` or `analyze.html` -> `signup.html` -> `welcome.html` or `dashboard.html`

Intent:

- show value quickly
- reduce friction with a free analysis
- convert later into Player, Performance, or Tournament Pro

### Returning player

Typical path:

`login.html` -> `dashboard.html` -> `analyze.html` -> `library.html` -> `settings.html`

Intent:

- upload or review another analysis
- view weekly action plan and top feedback
- consume drills and tactics
- manage plan and billing

### Coach journey

Typical path:

`for-coaches.html` -> `pricing.html` or `contact.html` -> `signup.html` -> `coach-dashboard.html`

Intent:

- understand roster and accountability workflow
- review athlete queue
- message athletes
- manage sessions and visibility guardrails

### Club or academy journey

Typical path:

`for-clubs.html` -> `contact.html` -> internal onboarding

Intent:

- discuss rollout
- evaluate organizational fit
- move toward implementation support rather than instant self-serve checkout

### Parent journey

Typical path:

`for-parents.html` -> `pricing.html` or `contact.html` -> `signup.html`

Intent:

- buy clarity, progress visibility, and better between-lesson structure for a junior player

### Pickleball interest capture

Typical path:

`pickleball.html` -> waitlist form submission

Intent:

- collect early-access leads
- store locally first, optionally sync through SmartSwing contact storage

## 3. Conversion and billing flow

Paid-plan flow:

`pricing.html` -> `signup.html?plan=...` or `checkout.html?plan=...` -> `/api/create-checkout-session` -> Stripe Checkout -> `payment-success.html` -> `settings.html`

Supporting routes:

- `cart.html`
- `payment-cancelled.html`
- `settings.html`

Important behavior:

- The selected plan is preserved through checkout intent in local storage.
- Free plan activation is internal.
- Paid plans use Stripe-hosted recurring billing.
- Billing portal access is launched from `settings.html`.

## 4. Product use flow after signup

Primary product loop:

1. Create account or sign in
2. Run analysis in `analyze.html`
3. Save assessment and recommendations
4. Review action plan in `dashboard.html`
5. Open `library.html` for drills and tactics
6. Book or review coaching in `coach-dashboard.html` or dashboard session modules
7. Return for another upload and compare progress

## 5. Navigation flow map

```text
Public discovery
  index.html
    -> features.html
    -> how-it-works.html
    -> pricing.html
    -> for-players.html
    -> for-coaches.html
    -> for-clubs.html
    -> for-parents.html
    -> blog.html
    -> contact.html
    -> pickleball.html
    -> analyze.html

Account entry
  signup.html
    -> auth-callback.html
    -> welcome.html
    -> dashboard.html
  login.html
    -> auth-callback.html
    -> dashboard.html

Core product
  dashboard.html
    -> analyze.html
    -> library.html
    -> coach-dashboard.html
    -> checkout.html
    -> settings.html

Billing
  pricing.html
    -> signup.html?plan=...
    -> checkout.html?plan=...
    -> /api/create-checkout-session
    -> payment-success.html
    -> settings.html
    -> /api/create-billing-portal-session
```

## 6. Gated and internal pages

These are product or post-checkout pages, not public SEO targets:

- `dashboard.html`
- `coach-dashboard.html`
- `cart.html`
- `checkout.html`
- `settings.html`
- `auth-callback.html`
- `payment-success.html`
- `payment-cancelled.html`
- `welcome.html`

`vercel.json` adds `X-Robots-Tag: noindex, nofollow, noarchive` for those routes.

## 7. What users are really buying

The navigation and messaging indicate three main value propositions:

- Players buy fast clarity on what to fix next
- Coaches buy a cleaner review and accountability workflow
- Clubs buy deployment support and a systemized process

That matters when continuing the product. Changes should preserve the path from "one upload" to "one clear next move."
