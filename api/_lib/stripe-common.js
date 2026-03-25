const Stripe = require('stripe');

const PLAN_PRICE_ENV = {
  starter: 'STRIPE_PRICE_STARTER_MONTHLY',
  pro: 'STRIPE_PRICE_PRO_MONTHLY',
  elite: 'STRIPE_PRICE_ELITE_MONTHLY'
};

const FALLBACK_ORIGIN = 'https://www.smartswingai.com';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getPublicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || FALLBACK_ORIGIN).replace(/\/+$/, '');
}

function normalizePlanId(planId) {
  return String(planId || '').trim().toLowerCase();
}

function getPriceEnvKeyForPlan(planId) {
  return PLAN_PRICE_ENV[normalizePlanId(planId)] || '';
}

function getPriceIdForPlan(planId) {
  const envKey = getPriceEnvKeyForPlan(planId);
  return envKey ? String(process.env[envKey] || '').trim() : '';
}

function getPlanIdForPrice(priceId) {
  const normalizedPriceId = String(priceId || '').trim();
  return Object.keys(PLAN_PRICE_ENV).find((planId) => getPriceIdForPlan(planId) === normalizedPriceId) || 'free';
}

function getStripeClient() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    const error = new Error('Stripe secret key is not configured.');
    error.code = 'stripe_not_configured';
    throw error;
  }
  return new Stripe(secretKey);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function toIsoFromUnix(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

function buildCheckoutUrls(planId) {
  const origin = getPublicAppUrl();
  return {
    successUrl: `${origin}/payment-success.html?provider=stripe&plan=${encodeURIComponent(planId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/payment-cancelled.html?provider=stripe&plan=${encodeURIComponent(planId)}`
  };
}

function getSubscriptionPriceId(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || '';
}

async function fetchSupabaseProfileByStripeCustomerId(customerId) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !customerId) return null;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`,
    {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  );

  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
}

async function patchSupabaseProfile(userId, patch) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !userId) {
    return { skipped: true };
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=representation'
      },
      body: JSON.stringify(patch)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase profile update failed: ${errorText}`);
  }

  const rows = await response.json();
  return { skipped: false, row: Array.isArray(rows) ? rows[0] : null };
}

module.exports = {
  buildCheckoutUrls,
  fetchSupabaseProfileByStripeCustomerId,
  getPlanIdForPrice,
  getPriceEnvKeyForPlan,
  getPriceIdForPlan,
  getPublicAppUrl,
  getStripeClient,
  getSubscriptionPriceId,
  json,
  normalizePlanId,
  patchSupabaseProfile,
  readJsonBody,
  readRawBody,
  toIsoFromUnix
};
