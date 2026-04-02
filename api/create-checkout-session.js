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

  if (!smartSwingUserId || !email) {
    return json(res, 400, { error: 'User id and email are required for paid checkout.' });
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
      // When a specific coupon code is supplied, apply it via discounts (incompatible with allow_promotion_codes).
      // Prefer STRIPE_PROMO_CODE_SWINGAI (promotion code ID e.g. promo_xxx) so Stripe shows "SWINGAI" as the
      // applied code label on the hosted checkout page. Fall back to coupon ID if only that var is set.
      ...(couponCode === 'SWINGAI' && (process.env.STRIPE_PROMO_CODE_SWINGAI || process.env.STRIPE_COUPON_SWINGAI)
        ? process.env.STRIPE_PROMO_CODE_SWINGAI
          ? { discounts: [{ promotion_code: process.env.STRIPE_PROMO_CODE_SWINGAI }] }
          : { discounts: [{ coupon: process.env.STRIPE_COUPON_SWINGAI }] }
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
