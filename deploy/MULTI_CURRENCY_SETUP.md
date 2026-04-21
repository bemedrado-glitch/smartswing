# Multi-Currency Stripe Setup — C6 from the Week 1 audit

## What the code now supports

- `POST /api/create-checkout-session` accepts `currency` + `country` params
- `pricing-currency.js` auto-detects visitor currency (locale + Cloudflare + browser → currency) and updates displayed prices on `pricing.html`
- Floating currency picker (bottom-right) lets visitors override
- Checkout passes the chosen currency + country to Stripe
- `automatic_payment_methods` surfaces region-appropriate methods (Pix for Brazil, SEPA/iDEAL for EU, etc.)

## What you still need to configure in Stripe (no code required)

The Price objects in Stripe need `currency_options` for each non-USD currency you want to charge in. Otherwise Stripe will error when the checkout session tries to create with a mismatched currency.

### One-time Stripe Dashboard setup

For EACH Price ID (STRIPE_PRICE_STARTER_MONTHLY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_STARTER_YEARLY, STRIPE_PRICE_PRO_YEARLY):

1. Stripe Dashboard → Products → click the Price
2. Click the three-dots menu → **"Manage currencies"** (or "Add currency")
3. For each currency you want to support, enter the amount:

| Plan | USD | BRL | MXN | EUR | GBP | CAD | AUD |
|---|---|---|---|---|---|---|---|
| **Player monthly** | $9.99 | R$49 | $199 | €9 | £8 | C$13 | A$14 |
| **Player yearly** | $99.99 | R$489 | $1,999 | €89 | £79 | C$129 | A$139 |
| **Performance monthly** | $19.99 | R$99 | $399 | €18 | £16 | C$27 | A$29 |
| **Performance yearly** | $199.99 | R$989 | $3,999 | €179 | £159 | C$269 | A$289 |

These exactly match the DISPLAY values in `pricing-currency.js` → `PRICING_TABLE`. If you change one, update the other so visitors aren't shown $X and charged $Y.

4. Save the Price. Stripe now has multi-currency on that Price.

### Verify multi-currency works

```bash
# From PowerShell — test a BRL checkout:
$body = @{
    planId = "pro"
    billingInterval = "monthly"
    smartSwingUserId = "test-uuid-here"
    email = "you@example.com"
    currency = "brl"
    country = "BR"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://www.smartswingai.com/api/create-checkout-session" -Method POST -ContentType "application/json" -Body $body
```

Expected response: `{ sessionId, url }`. Open the URL in a browser — you should see **R$99/mo** in the Stripe Checkout UI, not $19.99.

If Stripe errors with "no matching currency option on price", you haven't configured BRL on the Price in step 3.

### Enable regional payment methods

1. Stripe Dashboard → **Settings → Payment methods**
2. For each method you want, toggle on:
   - **Pix** — Brazil instant payments (hugely popular, lowers friction)
   - **Boleto** — Brazil cash-at-lottery (older demo, still 10-15% of BR payments)
   - **SEPA Direct Debit** — EU bank pulls
   - **iDEAL** — Netherlands
   - **Bancontact** — Belgium
   - **Giropay** — Germany
   - **Sofort** — DE/AT/BE/ES/IT
   - **BECS Direct Debit** — Australia
3. Each method may require additional setup (eg. business entity verification for Pix).

The checkout session already has `automatic_payment_methods` enabled, so Stripe will pick the right ones based on the customer's country.

### Currency display rate maintenance

The `PRICING_TABLE` in `pricing-currency.js` is approximate FX-based pricing, NOT live rates. When FX drifts (quarterly is fine), update:

1. Stripe Dashboard `currency_options` for each Price (charge amount)
2. `pricing-currency.js` → `PRICING_TABLE` (display amount)

Keep them in sync so "what they saw" matches "what they paid."

## LGPD / GDPR bonus

With the lite-signup change (C5) and now multi-currency (C6), a Brazilian visitor's full journey is:

1. Lands on `index.html` (in pt-BR via `i18n.js`)
2. Sees hero CTA → clicks → lands on `analyze.html`
3. Clicks Upload → lite-signup modal in pt-BR
4. Enters name + email + ticks LGPD-clean consent → submits
5. Analysis runs → report displays
6. Follow-up email arrives in pt-BR (after email-template i18n lands)
7. WhatsApp intro arrives in pt_BR (cadence runner auto-routes by country)
8. User goes to pricing.html → sees R$99/mo (not $19.99)
9. Clicks Choose Performance → checkout passes `currency: brl, country: BR`
10. Stripe Checkout shows Pix + Boleto options alongside credit card
11. User pays in BRL via Pix → confirmation email in pt-BR

Every step legally compliant, linguistically native, and friction-matched.

## Known gaps to fix later

- [ ] Email templates still English-only (tracked separately in the audit backlog as S2)
- [ ] Exchange rate updates are manual — could auto-pull from ECB API quarterly
- [ ] No handling for currency conversion when user CHANGES currency mid-session (they re-see prices but if they already have a pending checkout session it keeps the old currency)
- [ ] Tax (VAT for EU, ICMS for Brazil): `automatic_tax: { enabled: false }` is currently off. Turn on after Stripe Tax is configured.
