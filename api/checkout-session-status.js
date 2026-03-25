const {
  getPlanIdForPrice,
  getStripeClient,
  getSubscriptionPriceId,
  json,
  patchSupabaseProfile,
  toIsoFromUnix
} = require('./_lib/stripe-common');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const sessionId = String(req.query?.session_id || '').trim();
  if (!sessionId) {
    return json(res, 400, { error: 'Missing Stripe checkout session id.' });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return json(res, 500, { error: error.message || 'Stripe is not configured.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription']
    });

    const subscription = session.subscription && typeof session.subscription === 'object'
      ? session.subscription
      : null;

    const planId = String(
      session.metadata?.appPlanId ||
      (subscription ? getPlanIdForPrice(getSubscriptionPriceId(subscription)) : 'free')
    ).toLowerCase();

    const userId = session.client_reference_id || session.metadata?.smartSwingUserId || '';
    const subscriptionStatus = subscription?.status || (session.payment_status === 'paid' ? 'active' : session.status || 'open');
    const billingPeriodEnd = subscription?.current_period_end ? toIsoFromUnix(subscription.current_period_end) : null;
    const verified = session.status === 'complete' && ['paid', 'no_payment_required', 'unpaid'].includes(String(session.payment_status || '').toLowerCase());

    let profileSynced = false;
    if (verified && userId) {
      try {
        await patchSupabaseProfile(userId, {
          subscription_tier: planId,
          subscription_status: subscriptionStatus,
          stripe_customer_id: session.customer || null,
          billing_period_end: billingPeriodEnd
        });
        profileSynced = true;
      } catch (error) {
        profileSynced = false;
      }
    }

    return json(res, 200, {
      verified,
      planId,
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionStatus,
      billingPeriodEnd,
      stripeCustomerId: session.customer || '',
      stripeSubscriptionId: subscription?.id || '',
      smartSwingUserId: userId,
      profileSynced
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to retrieve Stripe checkout session.' });
  }
};
