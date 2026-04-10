const Stripe = require('stripe');

const PLAN_PRICE_ENV = {
  starter: {
    monthly: 'STRIPE_PRICE_STARTER_MONTHLY',
    yearly: 'STRIPE_PRICE_STARTER_YEARLY'
  },
  pro: {
    monthly: 'STRIPE_PRICE_PRO_MONTHLY',
    yearly: 'STRIPE_PRICE_PRO_YEARLY'
  },
  elite: {
    monthly: 'STRIPE_PRICE_ELITE_MONTHLY',
    yearly: 'STRIPE_PRICE_ELITE_YEARLY'
  }
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

function normalizeBillingInterval(interval) {
  const normalized = String(interval || 'monthly').trim().toLowerCase();
  if (normalized === 'annual') return 'yearly';
  return normalized === 'yearly' ? 'yearly' : 'monthly';
}

function getPriceEnvKeyForPlan(planId, billingInterval = 'monthly') {
  const envMap = PLAN_PRICE_ENV[normalizePlanId(planId)] || {};
  return envMap[normalizeBillingInterval(billingInterval)] || '';
}

function getPriceIdForPlan(planId, billingInterval = 'monthly') {
  const envKey = getPriceEnvKeyForPlan(planId, billingInterval);
  return envKey ? String(process.env[envKey] || '').trim() : '';
}

function getPriceMetaForPrice(priceId) {
  const normalizedPriceId = String(priceId || '').trim();
  for (const [planId, intervals] of Object.entries(PLAN_PRICE_ENV)) {
    for (const interval of Object.keys(intervals || {})) {
      if (getPriceIdForPlan(planId, interval) === normalizedPriceId) {
        return { planId, billingInterval: interval };
      }
    }
  }
  return { planId: 'free', billingInterval: 'monthly' };
}

function getPlanIdForPrice(priceId) {
  return getPriceMetaForPrice(priceId).planId;
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

async function fetchSupabaseProfileByUserId(userId) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !userId) return null;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,stripe_customer_id,stripe_subscription_id,subscription_tier,billing_interval&limit=1`,
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
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function patchSupabaseProfile(userId, patch) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !userId) {
    console.warn('[stripe-common] patchSupabaseProfile SKIPPED — missing:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey,
      hasUserId: !!userId
    });
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

async function upsertSupabaseSubscription(record) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !record?.user_id) {
    console.warn('[stripe-common] upsertSupabaseSubscription SKIPPED — missing:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey,
      hasUserId: !!record?.user_id
    });
    return { skipped: true };
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/customer_subscriptions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(record)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase subscription upsert failed: ${errorText}`);
  }

  const rows = await response.json();
  return { skipped: false, row: Array.isArray(rows) ? rows[0] : null };
}

module.exports = {
  buildCheckoutUrls,
  fetchSupabaseProfileByUserId,
  fetchSupabaseProfileByStripeCustomerId,
  getPlanIdForPrice,
  getPriceMetaForPrice,
  getPriceEnvKeyForPlan,
  getPriceIdForPlan,
  getPublicAppUrl,
  getStripeClient,
  getSubscriptionPriceId,
  json,
  normalizeBillingInterval,
  normalizePlanId,
  patchSupabaseProfile,
  readJsonBody,
  readRawBody,
  toIsoFromUnix,
  upsertSupabaseSubscription
};
