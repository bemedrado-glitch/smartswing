const {
  fetchSupabaseProfileByStripeCustomerId,
  getPlanIdForPrice,
  getStripeClient,
  getSubscriptionPriceId,
  json,
  patchSupabaseProfile,
  readRawBody,
  toIsoFromUnix
} = require('./_lib/stripe-common');

function mapSubscriptionStatusToPlanId(subscriptionStatus, requestedPlanId) {
  const normalized = String(subscriptionStatus || '').toLowerCase();
  if (['canceled', 'unpaid', 'incomplete', 'incomplete_expired'].includes(normalized)) {
    return 'free';
  }
  return requestedPlanId || 'free';
}

async function resolveUserIdForSubscription(subscription) {
  const fromMetadata = subscription?.metadata?.smartSwingUserId;
  if (fromMetadata) return fromMetadata;
  const customerId = subscription?.customer;
  if (!customerId) return '';
  return await fetchSupabaseProfileByStripeCustomerId(customerId);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return json(res, 500, { error: 'Stripe webhook secret is not configured.' });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return json(res, 500, { error: error.message || 'Stripe is not configured.' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    return json(res, 400, { error: 'Unable to read webhook body.' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return json(res, 400, { error: 'Missing Stripe signature header.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return json(res, 400, { error: error.message || 'Invalid Stripe webhook signature.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.smartSwingUserId || '';
        const planId = String(session.metadata?.appPlanId || 'free').toLowerCase();
        if (userId) {
          await patchSupabaseProfile(userId, {
            subscription_tier: planId,
            subscription_status: session.payment_status === 'paid' ? 'active' : session.status || 'complete',
            stripe_customer_id: session.customer || null
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const requestedPlanId = getPlanIdForPrice(getSubscriptionPriceId(subscription));
        const effectivePlanId = mapSubscriptionStatusToPlanId(subscription.status, requestedPlanId);
        const userId = await resolveUserIdForSubscription(subscription);
        if (userId) {
          await patchSupabaseProfile(userId, {
            subscription_tier: effectivePlanId,
            subscription_status: subscription.status || 'active',
            stripe_customer_id: subscription.customer || null,
            billing_period_end: toIsoFromUnix(subscription.current_period_end)
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const userId = customerId ? await fetchSupabaseProfileByStripeCustomerId(customerId) : '';
        if (userId) {
          await patchSupabaseProfile(userId, {
            subscription_status: 'past_due'
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    return json(res, 500, { error: error.message || 'Stripe webhook handling failed.' });
  }

  return json(res, 200, { received: true, type: event.type });
};
