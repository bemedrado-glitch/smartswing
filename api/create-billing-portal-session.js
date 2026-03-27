const {
  fetchSupabaseProfileByUserId,
  getPublicAppUrl,
  getStripeClient,
  json,
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

  const smartSwingUserId = String(body.smartSwingUserId || '').trim();
  if (!smartSwingUserId) {
    return json(res, 400, { error: 'SmartSwing user id is required.' });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    return json(res, 500, { error: error.message || 'Stripe is not configured.' });
  }

  const profile = await fetchSupabaseProfileByUserId(smartSwingUserId);
  const customerId = String(profile?.stripe_customer_id || '').trim();
  if (!customerId) {
    return json(res, 400, { error: 'No Stripe customer is linked to this account yet.' });
  }

  const returnTo = String(body.returnTo || '/settings.html').trim();
  const normalizedReturnTo = /^https?:/i.test(returnTo)
    ? returnTo
    : `${getPublicAppUrl()}${returnTo.startsWith('/') ? returnTo : `/${returnTo.replace(/^\.?\//, '')}`}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: normalizedReturnTo
    });

    return json(res, 200, { url: session.url });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to create Stripe billing portal session.' });
  }
};
