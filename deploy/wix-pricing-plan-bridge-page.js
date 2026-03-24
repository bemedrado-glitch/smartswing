import wixLocation from 'wix-location';
import { checkout } from 'wix-pricing-plans-frontend';
import { session } from 'wix-storage';

const PLAN_MAP = {
  starter: '732255dd-54cb-46e9-b485-ff72b9306d5d',
  pro: '68e3e64f-e5a7-4815-b184-95eeb7a0cd78',
  elite: 'a63e2873-cc4e-4aec-bf94-01966299d49d'
};

$w.onReady(async function () {
  const { plan, appPlanId, returnUrl, cancelUrl, source } = wixLocation.query;
  const normalizedPlan = String(appPlanId || plan || '').toLowerCase();
  const wixPlanId = PLAN_MAP[normalizedPlan];

  if (!wixPlanId) {
    redirect(cancelUrl, normalizedPlan, 'invalid-plan');
    return;
  }

  session.setItem('smartswing_checkout_source', source || 'wix-bridge');

  try {
    await checkout.startOnlinePurchase(wixPlanId);
    redirect(returnUrl, normalizedPlan, 'returned');
  } catch (error) {
    redirect(cancelUrl, normalizedPlan, 'cancelled', error?.message || 'purchase-cancelled');
  }
});

function redirect(target, plan, status, reason) {
  const fallback = `https://www.smartswingai.com/payment-success.html?provider=wix-pricing-plans&plan=${encodeURIComponent(plan || '')}&status=${encodeURIComponent(status || 'returned')}`;
  const url = new URL(target || fallback, fallback);
  url.searchParams.set('provider', 'wix-pricing-plans');
  if (plan) url.searchParams.set('plan', plan);
  if (status) url.searchParams.set('status', status);
  if (reason) url.searchParams.set('reason', reason);
  wixLocation.to(url.toString());
}
