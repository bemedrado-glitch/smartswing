const {
  fetchSupabaseProfileByStripeCustomerId,
  getPriceMetaForPrice,
  getStripeClient,
  getSubscriptionPriceId,
  json,
  patchSupabaseProfile,
  readRawBody,
  toIsoFromUnix,
  upsertSupabaseSubscription
} = require('./_lib/stripe-common');
const { renderTemplate } = require('./_lib/email-templates');

const RESEND_API = 'https://api.resend.com/emails';

async function maybeSendEmail(type, data) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey || !data?.email) return;
  try {
    const { subject, html } = renderTemplate(type, data);
    const from = String(process.env.RESEND_FROM_ADDRESS || '').trim() || 'SmartSwing AI <noreply@mail.smartswingai.com>';
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: data.email, subject, html })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[stripe-webhook] Resend ${type} failed (${res.status}):`, text.slice(0, 200));
    }
  } catch (err) {
    console.warn('[stripe-webhook] Email send error (non-critical):', err?.message || err);
  }
}

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
        const billingInterval = String(session.metadata?.billingInterval || 'monthly').toLowerCase();
        if (userId) {
          await patchSupabaseProfile(userId, {
            subscription_tier: planId,
            subscription_status: session.payment_status === 'paid' ? 'active' : session.status || 'complete',
            stripe_customer_id: session.customer || null,
            billing_interval: billingInterval
          });
          await upsertSupabaseSubscription({
            user_id: userId,
            provider: 'stripe',
            plan_id: planId,
            billing_interval: billingInterval,
            status: session.payment_status === 'paid' ? 'active' : session.status || 'complete',
            stripe_customer_id: session.customer || null,
            checkout_session_id: session.id,
            metadata: {
              payment_status: session.payment_status || null
            }
          });

          // Payment confirmation email — fire-and-forget
          if (session.payment_status === 'paid') {
            const customerEmail = String(session.metadata?.email || session.customer_email || '').trim().toLowerCase();
            const fullName = String(session.metadata?.fullName || '').trim();
            const firstName = fullName.split(' ')[0] || 'there';
            const planLabel = { starter: 'Player', pro: 'Performance', elite: 'Tournament', coach: 'Coach' }[planId] || planId;
            await maybeSendEmail('payment_success', {
              firstName,
              email: customerEmail,
              planName: planLabel,
              billingInterval
            });
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const priceMeta = getPriceMetaForPrice(getSubscriptionPriceId(subscription));
        const requestedPlanId = priceMeta.planId;
        const effectivePlanId = mapSubscriptionStatusToPlanId(subscription.status, requestedPlanId);
        const billingInterval = String(subscription.metadata?.billingInterval || priceMeta.billingInterval || 'monthly').toLowerCase();
        const userId = await resolveUserIdForSubscription(subscription);
        if (userId) {
          await patchSupabaseProfile(userId, {
            subscription_tier: effectivePlanId,
            subscription_status: subscription.status || 'active',
            stripe_customer_id: subscription.customer || null,
            stripe_subscription_id: subscription.id || null,
            billing_period_end: toIsoFromUnix(subscription.current_period_end),
            billing_interval: billingInterval,
            subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end || false),
            subscription_canceled_at: subscription.canceled_at ? toIsoFromUnix(subscription.canceled_at) : null
          });
          await upsertSupabaseSubscription({
            user_id: userId,
            provider: 'stripe',
            plan_id: effectivePlanId,
            billing_interval: billingInterval,
            status: subscription.status || 'active',
            stripe_customer_id: subscription.customer || null,
            stripe_subscription_id: subscription.id || null,
            current_period_start: toIsoFromUnix(subscription.current_period_start),
            current_period_end: toIsoFromUnix(subscription.current_period_end),
            cancel_at_period_end: Boolean(subscription.cancel_at_period_end || false),
            canceled_at: subscription.canceled_at ? toIsoFromUnix(subscription.canceled_at) : null,
            metadata: subscription.metadata || {}
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
          await upsertSupabaseSubscription({
            user_id: userId,
            provider: 'stripe',
            status: 'past_due',
            stripe_customer_id: customerId || null,
            stripe_subscription_id: invoice.subscription || null,
            metadata: {
              invoice_id: invoice.id || null
            }
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
