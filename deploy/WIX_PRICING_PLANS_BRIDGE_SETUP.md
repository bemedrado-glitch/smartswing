# Wix Pricing Plans Bridge Setup

Use this only if you want recurring billing to stay in Wix while the main application stays on Vercel.

## Current SmartSwing state

- Main site and app now serve from `https://www.smartswingai.com` on Vercel.
- SmartSwing recurring plans already exist in Wix Pricing Plans.
- The Vercel app is prepared to hand off paid checkout.
- What is still missing is a Wix-hosted bridge page that starts the official purchase flow and then redirects back to the app.

## Official Wix references

- Pricing Plans frontend checkout introduction:
  `https://dev.wix.com/docs/velo/apis/wix-pricing-plans-frontend/checkout/introduction`
- Pricing Plans ordering flow:
  `https://dev.wix.com/docs/velo/api-reference/wix-pricing-plans-backend/introduction`
- Tutorial for pricing plan ordering and payment:
  `https://dev.wix.com/docs/develop-websites/articles/wix-apps/wix-app-collections/other-apps/wix-pricing-plans/tutorial-using-the-pricing-plans-api-for-pricing-plan-ordering-and-payment`

## Recommended Wix-side setup

1. Create a hidden Wix page called `checkout-bridge`.
2. Turn on Velo for the Wix site.
3. Paste the contents of:
   - [wix-pricing-plan-bridge-page.js](C:/Users/bmedrado/Desktop/SmartSwing/_smartswing_repo/deploy/wix-pricing-plan-bridge-page.js)
   into the page code for the hidden bridge page.
4. Publish the Wix site.
5. Set the bridge URL in `app-data.js`:
   - `PAYMENT_PROVIDER_SETTINGS.wixPricingPlans.bridgePageUrl`
   - Example:
     `https://your-wix-site-url.com/checkout-bridge`

## Required query parameters from the app

The SmartSwing app already prepares these:

- `plan`
- `returnUrl`
- `cancelUrl`
- `source`

## Notes

- This keeps real recurring purchase logic in Wix.
- The Vercel app should still treat paid entitlements as locked until purchase status is verified.
- For production-grade activation, connect a secure callback or sync layer instead of trusting only a client redirect.
