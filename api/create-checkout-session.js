const {
  buildCheckoutUrls,
  getPriceEnvKeyForPlan,
  getPriceIdForPlan,
  getStripeClient,
  json,
  normalizeBillingInterval,
  normalizePlanId,
  readJsonBody
} = require('./_lib/stripe-common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return json(res, 400, { error: 'Invalid JSON body.' });
  }

  const planId = normalizePlanId(body.planId);
  const billingInterval = normalizeBillingInterval(body.billingInterval);
  if (!planId || planId === 'free') {
    return json(res, 400, { error: 'A paid SmartSwing plan is required for Stripe checkout.' });
  }

  const priceId = getPriceIdForPlan(planId, billingInterval);
  if (!priceId) {
    return json(res, 500, {
      error: `Stripe price id for ${planId} (${billingInterval}) is missing. Set ${getPriceEnvKeyForPlan(planId, billingInterval)} in Vercel.`
    });
  }

  const smartSwingUserId = String(body.smartSwingUserId || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.fullName || '').trim();
  const checkoutId = String(body.checkoutId || '').trim();
  const source = String(body.source || 'checkout-page').trim();
  const stripeCustomerId = String(body.stripeCustomerId || '').trim();
  const couponCode = String(body.couponCode || '').trim().toUpperCase();

  // Multi-currency support (C6 from Week 1 audit).
  // Pricing.html auto-detects the visitor's currency (geo + browser locale) and
  // passes it here. We forward to Stripe via checkout.sessions.create's `currency`
  // param + preferred_locale. Stripe will charge in that currency IFF the Price
  // object has a matching currency_option configured in the Stripe Dashboard.
  //
  // Supported currencies for SmartSwing initial rollout: USD (default), BRL (Brazil),
  // MXN (Mexico), EUR (EU), GBP (UK), CAD, AUD. Add more in CURRENCY_ALLOWLIST + the
  // Stripe Price's currency_options map to unlock additional markets.
  const CURRENCY_ALLOWLIST = new Set(['usd', 'brl', 'mxn', 'eur', 'gbp', 'cad', 'aud', 'chf', 'jpy', 'inr']);
  const requestedCurrency = String(body.currency || '').toLowerCase().trim();
  const currency = requestedCurrency && CURRENCY_ALLOWLIST.has(requestedCurrency) ? requestedCurrency : 'usd';

  // Optional country hint (ISO 2-letter). Passed to Stripe so it can surface
  // local payment methods (Pix for BR, SEPA for EU, BECS for AU, etc.).
  const customerCountry = String(body.country || '').toUpperCase().trim().slice(0, 2) || null;

  if (!smartSwingUserId || !email) {
    return json(res, 400, { error: 'User id and email are required for paid checkout.' });
  }

  // TENNISFOREVER is restricted to the Player ('pro') plan — first 100 players free forever.
  // Server-side check (Stripe metadata is just a tag — the API itself doesn't enforce plan restrictions).
  if (couponCode === 'TENNISFOREVER' && planId !== 'pro') {
    return json(res, 400, {
      error: 'TENNISFOREVER is only valid for the Player plan. Choose the Player plan to use this code.',
      code: 'coupon_plan_mismatch',
      coupon: 'TENNISFOREVER',
      requiredPlan: 'pro'
    });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return json(res, 500, { error: error.message || 'Stripe is not configured.' });
  }

  const urls = buildCheckoutUrls(planId);

  try {
    const sessionPayload = {
      mode: 'subscription',
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      client_reference_id: smartSwingUserId,
      customer_email: email,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      // Multi-currency — Stripe uses this currency if the Price has a matching
      // currency_option. Falls back to the Price's primary currency if not.
      // Only set when different from 'usd' (the default) so we don't force
      // currency on a single-currency Price unnecessarily.
      ...(currency !== 'usd' ? { currency } : {}),
      // automatic_payment_methods: Stripe auto-shows region-appropriate methods
      // (Pix for BR, SEPA for DE/NL, iDEAL for NL, Boleto for BR, BECS for AU, etc.)
      // Keeps `card` always as a fallback. No opt-out needed.
      payment_method_collection: 'if_required',
      automatic_tax: { enabled: false },
      // Preferred locale on Stripe Checkout hosted page (translates the UI).
      // Maps currency → likely language for the customer base.
      ...(currency === 'brl' ? { locale: 'pt-BR' }
          : currency === 'mxn' ? { locale: 'es-419' }
          : currency === 'eur' ? { locale: 'auto' }
          : {}),
      // When a specific coupon code is supplied, apply it via discounts (incompatible with allow_promotion_codes).
      // Prefer STRIPE_PROMO_CODE_SWINGAI (promotion code ID e.g. promo_xxx) so Stripe shows "SWINGAI" as the
      // applied code label on the hosted checkout page. Fall back to coupon ID if only that var is set.
      // Coupon application:
      // - SWINGAI (30-day free trial promo): apply via promotion_code env if set, else coupon id env
      // - TENNISFOREVER (100% off forever, max 100, Player plan only): direct coupon ID — created on Stripe
      // - Otherwise: allow_promotion_codes:true so users can type any active code on Stripe-hosted checkout
      ...((couponCode === 'SWINGAI' && (process.env.STRIPE_PROMO_CODE_SWINGAI || process.env.STRIPE_COUPON_SWINGAI))
        ? (process.env.STRIPE_PROMO_CODE_SWINGAI
            ? { discounts: [{ promotion_code: process.env.STRIPE_PROMO_CODE_SWINGAI }] }
            : { discounts: [{ coupon: process.env.STRIPE_COUPON_SWINGAI }] })
        : couponCode === 'TENNISFOREVER'
          ? { discounts: [{ coupon: 'TENNISFOREVER' }] }
          : { allow_promotion_codes: true }),
      metadata: {
        appPlanId: planId,
        billingInterval,
        smartSwingUserId,
        email,
        fullName,
        checkoutId,
        source
      },
      subscription_data: {
        metadata: {
          appPlanId: planId,
          billingInterval,
          smartSwingUserId,
          email,
          source
        }
      }
    };

    if (stripeCustomerId) {
      sessionPayload.customer = stripeCustomerId;
      delete sessionPayload.customer_email;
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);

    return json(res, 200, {
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Stripe checkout creation failed.' });
  }
};
