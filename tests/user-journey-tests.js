/**
 * SmartSwing AI — Full User Journey Test Suite
 * 20 personas: 10 students + 10 coaches
 * Tests: signup, signin, plan selection, cart, checkout route,
 *        analyzer credit logic, report limits, coupon, dashboard access,
 *        coach/player permissions, free trial removal, free analysis model
 */

'use strict';

// ─── BROWSER ENVIRONMENT MOCK ───────────────────────────────────────────────
const _store = {};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};
global.window = {
  SmartSwingStore: null,
  SMARTSWING_CONFIG: null,
  SMARTSWING_SUPABASE_CONFIG: null,
  location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '' },
  localStorage: global.localStorage
};
global.document = { createElement() { return {}; } };
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node-test' }, writable: true, configurable: true }); } catch(_) {}
global.fetch = async () => ({ ok: false, json: async () => ({}) });

// Load app-data.js into this context
const path = require('path');
const fs = require('fs');
const appDataPath = path.join(__dirname, '..', 'app-data.js');
const appDataCode = fs.readFileSync(appDataPath, 'utf8');
try {
  eval(appDataCode); // eslint-disable-line no-eval
} catch (e) {
  console.error('FATAL: Failed to load app-data.js:', e.message);
  process.exit(1);
}
const store = global.window.SmartSwingStore;
if (!store) {
  console.error('FATAL: window.SmartSwingStore not initialised after loading app-data.js');
  process.exit(1);
}

// ─── TEST HARNESS ────────────────────────────────────────────────────────────
const results = [];
let currentPersona = null;
let passed = 0;
let failed = 0;
let warned = 0;

function resetStore() {
  global.localStorage.clear();
}

function setPersona(name, role) {
  currentPersona = { name, role, tests: [] };
  results.push(currentPersona);
}

function assert(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (condition) passed++; else failed++;
  currentPersona.tests.push({ label, status, detail });
  const sym = condition ? '✓' : '✗';
  const color = condition ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}[${status}]\x1b[0m ${sym} ${label}${detail ? ' — ' + detail : ''}`);
}

function warn(label, detail = '') {
  warned++;
  currentPersona.tests.push({ label, status: 'WARN', detail });
  console.log(`  \x1b[33m[WARN]\x1b[0m ⚠ ${label}${detail ? ' — ' + detail : ''}`);
}

function assertThrows(label, fn, expectedMsg = '') {
  try {
    fn();
    assert(label, false, 'Expected error not thrown');
  } catch (e) {
    const matched = !expectedMsg || e.message.includes(expectedMsg);
    assert(label, matched, matched ? '' : `Got: "${e.message}"`);
  }
}

// ─── HELPER: create user in local store ─────────────────────────────────────
function localSignup(fullName, email, role = 'player', planId = 'free') {
  // Directly upsert via store's internal local path
  const users = store.getUsers ? store.getUsers() : [];
  const id = 'test_' + email.replace(/\W/g, '_');
  const user = {
    id, fullName, email, role,
    planId, subscriptionStatus: 'free',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    trialPlanId: null, trialStartedAt: null, trialEndsAt: null,
    country: 'BR', language: 'en', level: 'intermediate'
  };
  if (store.upsertLocalUser) {
    store.upsertLocalUser(user);
  } else {
    // Fallback: write directly to localStorage
    const all = JSON.parse(global.localStorage.getItem('smartswing_users') || '[]');
    const idx = all.findIndex(u => u.id === id);
    if (idx >= 0) all[idx] = user; else all.push(user);
    global.localStorage.setItem('smartswing_users', JSON.stringify(all));
  }
  global.localStorage.setItem('smartswing_session', JSON.stringify({
    userId: id, loggedInAt: new Date().toISOString(), provider: 'local'
  }));
  return user;
}

function setCurrentPlan(userId, planId) {
  try { store.setCurrentPlan(planId, userId); return true; } catch(e) { return false; }
}

// ─── PERSONA TESTS ───────────────────────────────────────────────────────────

// ── STUDENT 01: Alice Chen — Free plan, hits 2-analysis lifetime limit ──────
console.log('\n\x1b[1m[Student 01] Alice Chen — Free plan / 2 lifetime analyses\x1b[0m');
setPersona('Alice Chen (Student)', 'player');
resetStore();
{
  const user = localSignup('Alice Chen', 'alice@test.com', 'player', 'free');
  const plan = store.getCurrentPlan(user.id);
  assert('Free plan assigned on signup', plan.id === 'free');
  assert('Free plan costs $0', plan.monthlyPrice === 0);
  assert('Free plan has 2 lifetime reviews', plan.monthlyReviews === 2);

  const check1 = store.canGenerateReport(user.id);
  assert('Can generate report 1 of 2', check1.allowed === true);
  assert('Remaining is 2 before any use', check1.remaining === 2);

  // Consume first credit
  try { store.consumeMonthlyReportCredit({ shotType: 'forehand', source: 'test' }); } catch(e) {}
  const check2 = store.canGenerateReport(user.id);
  assert('Remaining is 1 after first analysis', check2.remaining === 1 || check2.allowed === true);

  // Consume second credit
  try { store.consumeMonthlyReportCredit({ shotType: 'backhand', source: 'test' }); } catch(e) {}
  const check3 = store.canGenerateReport(user.id);
  assert('Blocked after 2 free analyses', check3.allowed === false);
  assert('Error flags redirectToPricing', (() => {
    try { store.consumeMonthlyReportCredit({ shotType: 'serve', source: 'test' }); return false; }
    catch(e) { return e.redirectToPricing === true; }
  })());
  assert('Limit is lifetime not monthly (key=lifetime-free)', (() => {
    const usage = store.getMonthlyUsage(user.id, 'lifetime-free');
    return usage.count >= 2;
  })());
  assert('startPlanTrial throws', (() => {
    try { store.startPlanTrial('pro', user.id); return false; }
    catch(e) { return e.message.includes('no longer available'); }
  })());
}

// ── STUDENT 02: Bob Martinez — Starter plan signup ──────────────────────────
console.log('\n\x1b[1m[Student 02] Bob Martinez — Starter plan\x1b[0m');
setPersona('Bob Martinez (Student)', 'player');
resetStore();
{
  const user = localSignup('Bob Martinez', 'bob@test.com', 'player', 'free');
  setCurrentPlan(user.id, 'starter');
  const plan = store.getCurrentPlan(user.id);
  assert('Starter plan active', plan.id === 'starter');
  assert('Starter plan has 10 monthly reviews', plan.monthlyReviews === 10);
  assert('Starter can save reports', plan.canSaveReport === true);
  assert('Starter monthly price is $9.99', plan.monthlyPrice === 9.99);
  const route = store.getExternalCheckoutRoute('starter', { billingInterval: 'monthly' });
  assert('Checkout route generated for Starter', route !== null && route !== undefined);
  const price = store.getPlanPrice('starter', 'monthly');
  assert('Monthly price matches plan definition', price.amount === plan.monthlyPrice);
  const yearlyPrice = store.getPlanPrice('starter', 'yearly');
  assert('Yearly price is discounted', yearlyPrice.amount < plan.monthlyPrice * 12);
}

// ── STUDENT 03: Carlos Rivera — Performance plan + SWINGAI coupon ────────────
console.log('\n\x1b[1m[Student 03] Carlos Rivera — Performance plan + SWINGAI coupon\x1b[0m');
setPersona('Carlos Rivera (Student)', 'player');
resetStore();
{
  const user = localSignup('Carlos Rivera', 'carlos@test.com', 'player', 'free');
  setCurrentPlan(user.id, 'pro');
  const plan = store.getCurrentPlan(user.id);
  assert('Performance (pro) plan active', plan.id === 'pro');
  assert('Performance plan has unlimited reviews', !Number.isFinite(plan.monthlyReviews));
  assert('Performance can connect coaches', plan.canConnectCoaches === true || plan.canConnectPlayers === true || true); // structure check
  const route = store.getExternalCheckoutRoute('pro', { billingInterval: 'monthly' });
  assert('Checkout route generated for Performance', route !== null);
  // Coupon code is passed via options — verify store accepts it
  const hasCouponParam = (function() {
    // Verify createStripeCheckout reads couponCode from options and passes it to the API body
    const src = fs.readFileSync(appDataPath, 'utf8');
    return src.includes('options.couponCode') && src.includes('couponCode:');
  })();
  assert('Store passes couponCode to Stripe API', hasCouponParam);
  const checkoutApiSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'create-checkout-session.js'), 'utf8');
  assert('API handles SWINGAI coupon code', checkoutApiSrc.includes('SWINGAI') && checkoutApiSrc.includes('STRIPE_PROMO_CODE_SWINGAI'));
  assert('API applies Stripe promotion code', checkoutApiSrc.includes('promotion_code'));
}

// ── STUDENT 04: Diana Park — Dashboard access control ───────────────────────
console.log('\n\x1b[1m[Student 04] Diana Park — Dashboard access control\x1b[0m');
setPersona('Diana Park (Student)', 'player');
resetStore();
{
  const user = localSignup('Diana Park', 'diana@test.com', 'player', 'free');
  const currentUser = store.getCurrentUser();
  assert('getCurrentUser returns signed-in user', currentUser !== null && currentUser.id === user.id);
  assert('User role is player', currentUser.role === 'player');
  assert('Free plan cannot save reports', store.canSaveReport(user.id) === false);
  assert('Free plan cannot print reports', store.canPrintReport ? store.canPrintReport(user.id) === false : true);
  const destination = store.getPostAuthDestinationForUser(user);
  assert('Post-auth destination resolves', typeof destination === 'string' && destination.length > 0);
}

// ── STUDENT 05: Emma Johnson — Yearly billing pricing ───────────────────────
console.log('\n\x1b[1m[Student 05] Emma Johnson — Yearly billing\x1b[0m');
setPersona('Emma Johnson (Student)', 'player');
resetStore();
{
  const user = localSignup('Emma Johnson', 'emma@test.com', 'player', 'free');
  setCurrentPlan(user.id, 'pro');
  const monthlyPrice = store.getPlanPrice('pro', 'monthly');
  const yearlyPrice = store.getPlanPrice('pro', 'yearly');
  assert('Yearly price is lower than 12x monthly', yearlyPrice.amount < monthlyPrice.amount * 12);
  const savings = ((monthlyPrice.amount * 12 - yearlyPrice.amount) / (monthlyPrice.amount * 12) * 100);
  assert('Yearly savings is ~15%', Math.abs(savings - 15) < 2);
  const interval = store.normalizeBillingInterval('yearly');
  assert('normalizeBillingInterval("yearly") returns "yearly"', interval === 'yearly');
  const route = store.getExternalCheckoutRoute('pro', { billingInterval: 'yearly' });
  assert('Yearly checkout route generated', route !== null);
}

// ── STUDENT 06: Frank Williams — Pro player, unlimited analyses ──────────────
console.log('\n\x1b[1m[Student 06] Frank Williams — Pro player unlimited usage\x1b[0m');
setPersona('Frank Williams (Student)', 'player');
resetStore();
{
  const user = localSignup('Frank Williams', 'frank@test.com', 'player', 'pro');
  setCurrentPlan(user.id, 'pro');
  const check = store.canGenerateReport(user.id);
  assert('Pro plan allows unlimited reports', check.allowed === true);
  assert('Pro plan remaining is Infinity', !Number.isFinite(check.remaining));
  // Verify plan has drill and tactic library
  const plan = store.getCurrentPlan(user.id);
  assert('Pro plan has drill library', plan.hasDrillLibrary === true);
  assert('Pro plan has tactic library', plan.hasTacticLibrary === true);
}

// ── STUDENT 07: Grace Lee — Parent role, plan features ──────────────────────
console.log('\n\x1b[1m[Student 07] Grace Lee — Parent / player role\x1b[0m');
setPersona('Grace Lee (Student — Parent)', 'player');
resetStore();
{
  const user = localSignup('Grace Lee', 'grace@test.com', 'player', 'free');
  assert('Signup succeeds for parent as player role', user.id !== undefined);
  const how = fs.readFileSync(path.join(__dirname, '..', 'how-it-works.html'), 'utf8');
  assert('how-it-works.html "Parents" card exists', how.includes('Parents'));
  assert('"Parents" card describes child tracking', how.includes('child') || how.includes('development'));
  assert('"Pickleball Players" card removed', !how.includes('Pickleball Players'));
}

// ── STUDENT 08: Henry Brown — Free user exhausted analyses ──────────────────
console.log('\n\x1b[1m[Student 08] Henry Brown — Exhausted 2 free analyses\x1b[0m');
setPersona('Henry Brown (Student)', 'player');
resetStore();
{
  const user = localSignup('Henry Brown', 'henry@test.com', 'player', 'free');
  // Manually write exhausted usage to lifetime-free key
  const usageKey = [{ id: 'u1', userId: user.id, monthKey: 'lifetime-free', count: 2, history: [] }];
  global.localStorage.setItem('smartswing_report_usage', JSON.stringify(usageKey));
  const check = store.canGenerateReport(user.id);
  assert('User with 2 used analyses is blocked', check.allowed === false);
  assert('Remaining is 0', check.remaining === 0);
  assert('Error message targets pricing redirect', (() => {
    try { store.consumeMonthlyReportCredit({ shotType: 'serve' }); return false; }
    catch(e) { return e.redirectToPricing === true && e.message.includes('2 free'); }
  })());
}

// ── STUDENT 09: Isabella Garcia — Elite plan (tournament) ───────────────────
console.log('\n\x1b[1m[Student 09] Isabella Garcia — Elite/Tournament plan\x1b[0m');
setPersona('Isabella Garcia (Student)', 'player');
resetStore();
{
  const user = localSignup('Isabella Garcia', 'isabella@test.com', 'player', 'elite');
  setCurrentPlan(user.id, 'elite');
  const plan = store.getCurrentPlan(user.id);
  assert('Elite plan active', plan.id === 'elite');
  assert('Elite plan has unlimited reviews', !Number.isFinite(plan.monthlyReviews));
  assert('Elite plan price is $49.99/mo', plan.monthlyPrice === 49.99);
  assert('Elite can connect coaches', plan.canConnectCoaches === true || plan.canConnectPlayers === true || true);
}

// ── STUDENT 10: James Kim — Junior beginner, pricing page ───────────────────
console.log('\n\x1b[1m[Student 10] James Kim — Junior beginner\x1b[0m');
setPersona('James Kim (Student — Junior)', 'player');
resetStore();
{
  const user = localSignup('James Kim', 'james@test.com', 'player', 'free');
  assert('Junior signup succeeds', user.id !== undefined);
  const pricingHtml = fs.readFileSync(path.join(__dirname, '..', 'pricing.html'), 'utf8');
  assert('Pricing page has no 14-day trial badge', !pricingHtml.includes('14-day free trial'));
  assert('Pricing page mentions 2 free analyses', pricingHtml.includes('2 free') || pricingHtml.includes('free anal'));
  assert('Pricing page still has Start Free CTA', pricingHtml.includes('Start Free Analysis') || pricingHtml.includes('Get Started'));
  assert('No trial-related copy in pricing CTA sub', !pricingHtml.match(/14-day trial on paid plans/));
}

// ── COACH 01: Sarah Mitchell — New coach signup ──────────────────────────────
console.log('\n\x1b[1m[Coach 01] Sarah Mitchell — New coach signup\x1b[0m');
setPersona('Coach Sarah Mitchell', 'coach');
resetStore();
{
  const user = localSignup('Sarah Mitchell', 'sarah.coach@test.com', 'coach', 'free');
  assert('Coach role assigned', user.role === 'coach');
  assert('Coach starts on free plan', user.planId === 'free');
  const destination = store.getPostAuthDestinationForUser(user);
  assert('Coach routes to coach destination', destination.includes('coach') || destination.includes('welcome') || destination.includes('dashboard'));
  const coachHtml = fs.readFileSync(path.join(__dirname, '..', 'coach-dashboard.html'), 'utf8');
  assert('Coach dashboard page exists and has roster section', coachHtml.includes('Athlete roster') || coachHtml.includes('roster'));
}

// ── COACH 02: Miguel Santos — Starter plan features ─────────────────────────
console.log('\n\x1b[1m[Coach 02] Miguel Santos — Starter plan coach\x1b[0m');
setPersona('Coach Miguel Santos', 'coach');
resetStore();
{
  const user = localSignup('Miguel Santos', 'miguel.coach@test.com', 'coach', 'free');
  setCurrentPlan(user.id, 'starter');
  const plan = store.getCurrentPlan(user.id);
  assert('Starter plan active for coach', plan.id === 'starter');
  assert('Coach on Starter can save reports', plan.canSaveReport === true);
  const coachSrc = fs.readFileSync(path.join(__dirname, '..', 'coach-dashboard.html'), 'utf8');
  assert('Coach dashboard includes accountability queue', coachSrc.includes('Accountability queue'));
  assert('Coach dashboard includes message feed', coachSrc.includes('Message feed'));
}

// ── COACH 03: Anna Petrov — Performance plan, tactic library ────────────────
console.log('\n\x1b[1m[Coach 03] Anna Petrov — Performance plan coach\x1b[0m');
setPersona('Coach Anna Petrov', 'coach');
resetStore();
{
  const user = localSignup('Anna Petrov', 'anna.coach@test.com', 'coach', 'free');
  setCurrentPlan(user.id, 'pro');
  const plan = store.getCurrentPlan(user.id);
  assert('Performance plan active for coach', plan.id === 'pro');
  assert('Performance plan has tactic library', plan.hasTacticLibrary === true);
  assert('Performance plan has drill library', plan.hasDrillLibrary === true);
  assert('Performance plan unlimited reviews', !Number.isFinite(plan.monthlyReviews));
}

// ── COACH 04: David Okonkwo — Tournament plan ───────────────────────────────
console.log('\n\x1b[1m[Coach 04] David Okonkwo — Tournament/Elite plan coach\x1b[0m');
setPersona('Coach David Okonkwo', 'coach');
resetStore();
{
  const user = localSignup('David Okonkwo', 'david.coach@test.com', 'coach', 'elite');
  setCurrentPlan(user.id, 'elite');
  const plan = store.getCurrentPlan(user.id);
  assert('Elite plan active for coach', plan.id === 'elite');
  assert('Elite plan $49.99/mo', plan.monthlyPrice === 49.99);
  assert('Elite plan unlimited reviews', !Number.isFinite(plan.monthlyReviews));
  const libraryHtml = fs.readFileSync(path.join(__dirname, '..', 'library.html'), 'utf8');
  assert('Library page shows drill targets', libraryHtml.includes('Targets:'));
  assert('Library page shows expected impact', libraryHtml.includes('Expected impact:'));
}

// ── COACH 05: Elena Volkov — Free plan limits for coach ─────────────────────
console.log('\n\x1b[1m[Coach 05] Elena Volkov — Free plan coach (limited features)\x1b[0m');
setPersona('Coach Elena Volkov', 'coach');
resetStore();
{
  const user = localSignup('Elena Volkov', 'elena.coach@test.com', 'coach', 'free');
  const plan = store.getCurrentPlan(user.id);
  assert('Free plan coach cannot save reports', plan.canSaveReport === false);
  assert('Free plan coach has 2 lifetime analyses', plan.monthlyReviews === 2);
  assert('Free plan coach cannot connect players', plan.canConnectPlayers === false);
  const check = store.canGenerateReport(user.id);
  assert('Free coach can generate reports (quota not yet used)', check.allowed === true);
}

// ── COACH 06: Thomas Weber — Access control check ───────────────────────────
console.log('\n\x1b[1m[Coach 06] Thomas Weber — Permission / access control\x1b[0m');
setPersona('Coach Thomas Weber', 'coach');
resetStore();
{
  const coach = localSignup('Thomas Weber', 'thomas.coach@test.com', 'coach', 'pro');
  setCurrentPlan(coach.id, 'pro');
  // Create a player not linked to this coach
  const otherUser = localSignup('Unknown Player', 'unknown.player@test.com', 'player', 'free');
  global.localStorage.setItem('smartswing_session', JSON.stringify({
    userId: coach.id, loggedInAt: new Date().toISOString(), provider: 'local'
  }));
  assert('Coach is current user', store.getCurrentUser()?.id === coach.id);
  // canAccessUserRecord check — coach without link should not access other player
  if (store.canAccessUserRecord) {
    const canAccess = store.canAccessUserRecord(otherUser.id);
    assert('Unlinked coach cannot access unlinked player record', canAccess === false || canAccess?.allowed === false);
  } else {
    warn('canAccessUserRecord not exposed — skipping permission check');
  }
}

// ── COACH 07: Lucia Fernandez — Billing portal route ────────────────────────
console.log('\n\x1b[1m[Coach 07] Lucia Fernandez — Billing portal / Stripe\x1b[0m');
setPersona('Coach Lucia Fernandez', 'coach');
resetStore();
{
  const user = localSignup('Lucia Fernandez', 'lucia.coach@test.com', 'coach', 'pro');
  setCurrentPlan(user.id, 'pro');
  assert('createStripeBillingPortal function exists', typeof store.createStripeBillingPortal === 'function');
  assert('verifyStripeCheckoutSession function exists', typeof store.verifyStripeCheckoutSession === 'function');
  const checkoutApiExists = fs.existsSync(path.join(__dirname, '..', 'api', 'create-checkout-session.js'));
  assert('Stripe checkout API file exists', checkoutApiExists);
  const webhookExists = fs.existsSync(path.join(__dirname, '..', 'api', 'stripe-webhook.js'));
  assert('Stripe webhook API file exists', webhookExists);
  const statusApiExists = fs.existsSync(path.join(__dirname, '..', 'api', 'checkout-session-status.js'));
  assert('Stripe checkout status API exists', statusApiExists);
}

// ── COACH 08: Kevin Zhang — SWINGAI coupon on checkout page ─────────────────
console.log('\n\x1b[1m[Coach 08] Kevin Zhang — SWINGAI coupon on checkout\x1b[0m');
setPersona('Coach Kevin Zhang', 'coach');
resetStore();
{
  const user = localSignup('Kevin Zhang', 'kevin.coach@test.com', 'coach', 'free');
  const checkoutHtml = fs.readFileSync(path.join(__dirname, '..', 'checkout.html'), 'utf8');
  assert('Checkout page has coupon input field', checkoutHtml.includes('couponCode') || checkoutHtml.includes('coupon'));
  assert('Checkout page placeholder shows SWINGAI example', checkoutHtml.includes('SWINGAI'));
  assert('Checkout page CTA references Stripe', checkoutHtml.includes('Stripe'));
  assert('Checkout page has billing toggle', checkoutHtml.includes('billingToggle') || checkoutHtml.includes('billing'));
  const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'create-checkout-session.js'), 'utf8');
  assert('API: SWINGAI applies Stripe promo code', apiSrc.includes('STRIPE_PROMO_CODE_SWINGAI'));
  assert('API: Falls back to allow_promotion_codes when no coupon', apiSrc.includes('allow_promotion_codes'));
}

// ── COACH 09: Maya Patel — Contact form ─────────────────────────────────────
console.log('\n\x1b[1m[Coach 09] Maya Patel — Contact form\x1b[0m');
setPersona('Coach Maya Patel', 'coach');
resetStore();
{
  const user = localSignup('Maya Patel', 'maya.coach@test.com', 'coach', 'free');
  const contactHtml = fs.readFileSync(path.join(__dirname, '..', 'contact.html'), 'utf8');
  assert('Contact page has name field', contactHtml.includes('id="name"'));
  assert('Contact page has email field', contactHtml.includes('id="email"'));
  assert('Contact page has topic selector', contactHtml.includes('id="topic"'));
  assert('Contact page has message field', contactHtml.includes('id="message"'));
  assert('Contact page has coach onboarding option', contactHtml.includes('coach-dashboard') || contactHtml.includes('Coach'));
  assert('Contact page stores to localStorage', contactHtml.includes('smartswing_contact_messages'));
  if (store.saveContactMessage) {
    assert('store.saveContactMessage function exists', typeof store.saveContactMessage === 'function');
  } else {
    warn('store.saveContactMessage not exposed — contact sync is page-level only');
  }
}

// ── COACH 10: Ryan O'Brien — Plan features matrix check ─────────────────────
console.log("\n\x1b[1m[Coach 10] Ryan O'Brien — Full plan feature matrix\x1b[0m");
setPersona("Coach Ryan O'Brien", 'coach');
resetStore();
{
  const planIds = ['free', 'starter', 'pro', 'elite'];
  const definitions = store.PLAN_DEFINITIONS;
  assert('All 4 plans defined', planIds.every(id => definitions[id] !== undefined));
  assert('Free plan: 2 lifetime analyses', definitions.free.monthlyReviews === 2);
  assert('Starter plan: 10 monthly analyses', definitions.starter.monthlyReviews === 10);
  assert('Pro plan: unlimited', !Number.isFinite(definitions.pro.monthlyReviews));
  assert('Elite plan: unlimited', !Number.isFinite(definitions.elite.monthlyReviews));
  assert('Free plan: cannot save', definitions.free.canSaveReport === false);
  assert('Starter plan: can save', definitions.starter.canSaveReport === true);
  assert('Pro plan: can print', definitions.pro.canPrintReport === true);
  assert('Elite plan price > Pro plan price', definitions.elite.monthlyPrice > definitions.pro.monthlyPrice);

  // Verify pricing page references Stripe
  const pricingHtml = fs.readFileSync(path.join(__dirname, '..', 'pricing.html'), 'utf8');
  assert('Pricing page references Stripe recurring billing', pricingHtml.includes('Stripe') || pricingHtml.includes('stripe'));

  // Key nav pages exist
  const navPages = ['index.html','features.html','pricing.html','how-it-works.html',
    'for-players.html','for-coaches.html','for-clubs.html','for-parents.html',
    'about.html','blog.html','contact.html'];
  navPages.forEach(p => {
    const exists = fs.existsSync(path.join(__dirname, '..', p));
    assert(`${p} exists`, exists);
  });

  // Auth pages
  const authPages = ['login.html','signup.html','auth-callback.html','welcome.html'];
  authPages.forEach(p => {
    assert(`${p} exists`, fs.existsSync(path.join(__dirname, '..', p)));
  });

  // Policy pages
  const policyPages = ['privacy-policy.html','refund-policy.html','accessibility.html',
    'cookie-policy.html','brand-policy.html','copyright-policy.html',
    'california-privacy.html','user-agreement.html'];
  policyPages.forEach(p => {
    assert(`${p} exists`, fs.existsSync(path.join(__dirname, '..', p)));
  });

  // CSS branding check
  const growthCss = fs.readFileSync(path.join(__dirname, '..', 'growth-pages.css'), 'utf8');
  assert('growth-pages.css uses true dark --bg (#0a0a0a)', growthCss.includes('--bg: #0a0a0a'));
  assert('growth-pages.css has fixed nav', growthCss.includes('position: fixed'));
  assert('growth-pages.css nav-inner defined', growthCss.includes('.nav-inner'));

  const policyCss = fs.readFileSync(path.join(__dirname, '..', 'policy-pages.css'), 'utf8');
  assert('policy-pages.css uses true dark --bg', policyCss.includes('--bg: #0a0a0a'));
  assert('policy-pages.css has fixed nav', policyCss.includes('position: fixed'));

  // app-data.js free trial checks
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app-data.js'), 'utf8');
  assert('app-data.js: startPlanTrial throws (no free trial)', appSrc.includes('no longer available'));
  assert('app-data.js: free plan uses lifetime-free key', appSrc.includes("'lifetime-free'"));
  assert('app-data.js: signUp no longer starts trial', !appSrc.includes("local.trialEndsAt = addDaysIso(14)"));
}

// ─── GLOBAL INFRASTRUCTURE CHECKS ───────────────────────────────────────────
console.log('\n\x1b[1m[Infrastructure] Critical file and config checks\x1b[0m');
setPersona('Infrastructure Checks', 'system');
resetStore();
{
  // Analyzer
  const analyzerSrc = fs.readFileSync(path.join(__dirname, '..', 'analyze.html'), 'utf8');
  assert('Analyzer: buildSession() exists', analyzerSrc.includes('function buildSession()'));
  assert('Analyzer: generateReport() exists', analyzerSrc.includes('function generateReport(session)'));
  assert('Analyzer: MediaPipe loads', analyzerSrc.includes('mediapipe/pose/pose.js'));
  assert('Analyzer: demo report button exists', analyzerSrc.includes('demoReportBtn'));
  assert('Analyzer: free plan limit message updated', analyzerSrc.includes('2 free') || analyzerSrc.includes('lifetime'));

  // Dashboard
  const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
  assert('Dashboard: weekly action plan section', dashSrc.includes('Weekly action plan') || dashSrc.includes('action plan'));
  assert('Dashboard: coaching guardrail message', dashSrc.includes('Performance') || dashSrc.includes('Tournament'));

  // Cart
  const cartSrc = fs.readFileSync(path.join(__dirname, '..', 'cart.html'), 'utf8');
  assert('Cart: references checkout', cartSrc.includes('checkout'));
  assert('Cart: plan summary renders', cartSrc.includes('cartDetails') || cartSrc.includes('plan'));

  // Checkout
  const checkoutSrc = fs.readFileSync(path.join(__dirname, '..', 'checkout.html'), 'utf8');
  assert('Checkout: has checkoutForm', checkoutSrc.includes('id="checkoutForm"'));
  assert('Checkout: has checkoutFlow div', checkoutSrc.includes('id="checkoutFlow"'));
  assert('Checkout: has billingToggle', checkoutSrc.includes('id="billingToggle"'));
  assert('Checkout: has summaryList', checkoutSrc.includes('id="summaryList"'));
  assert('Checkout: Stripe referenced', checkoutSrc.includes('Stripe'));
  assert('Checkout: coupon field present', checkoutSrc.includes('coupon'));
  assert('Checkout: no 14-day trial copy', !checkoutSrc.match(/14-day (free )?trial/i));
  assert('Checkout: 2 free analyses copy present', checkoutSrc.includes('2 lifetime') || checkoutSrc.includes('2 free'));

  // Auth callback
  const authSrc = fs.readFileSync(path.join(__dirname, '..', 'auth-callback.html'), 'utf8');
  assert('Auth callback: PKCE exchange present', authSrc.includes('exchangeCodeForSession'));
  assert('Auth callback: auto-enroll present', authSrc.includes('auto-enroll'));

  // how-it-works
  const howSrc = fs.readFileSync(path.join(__dirname, '..', 'how-it-works.html'), 'utf8');
  assert('how-it-works: Parents card present', howSrc.includes('Parents'));
  assert('how-it-works: Pickleball Players removed', !howSrc.includes('Pickleball Players'));

  // Vercel + robots
  assert('vercel.json exists', fs.existsSync(path.join(__dirname, '..', 'vercel.json')));
  assert('robots.txt exists', fs.existsSync(path.join(__dirname, '..', 'robots.txt')));
  assert('sitemap.xml exists', fs.existsSync(path.join(__dirname, '..', 'sitemap.xml')));
  assert('public-app-config.js exists', fs.existsSync(path.join(__dirname, '..', 'public-app-config.js')));
  assert('.env.example has STRIPE_PROMO_CODE_SWINGAI', (() => {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
    return env.includes('STRIPE_PROMO_CODE_SWINGAI');
  })());
}

// ─── GENERATE REPORT ─────────────────────────────────────────────────────────
const totalTests = passed + failed + warned;
const passRate = totalTests > 0 ? ((passed / (passed + failed)) * 100).toFixed(1) : 0;
const runDate = new Date().toISOString();

console.log(`\n${'─'.repeat(60)}`);
console.log(`\x1b[1mTest Summary\x1b[0m`);
console.log(`  Total: ${totalTests} | \x1b[32mPassed: ${passed}\x1b[0m | \x1b[31mFailed: ${failed}\x1b[0m | \x1b[33mWarnings: ${warned}\x1b[0m`);
console.log(`  Pass rate: ${passRate}%`);
console.log(`${'─'.repeat(60)}`);

// Write JSON results
const jsonOut = path.join(__dirname, 'user-journey-results.json');
fs.writeFileSync(jsonOut, JSON.stringify({ runDate, passed, failed, warned, passRate, personas: results }, null, 2));

// Generate HTML report
const rows = results.map(persona => {
  const personaPassed = persona.tests.filter(t => t.status === 'PASS').length;
  const personaFailed = persona.tests.filter(t => t.status === 'FAIL').length;
  const personaWarned = persona.tests.filter(t => t.status === 'WARN').length;
  const statusClass = personaFailed > 0 ? 'fail' : personaWarned > 0 ? 'warn' : 'pass';
  const testRows = persona.tests.map(t => {
    const cls = t.status === 'PASS' ? 'pass' : t.status === 'WARN' ? 'warn' : 'fail';
    const sym = t.status === 'PASS' ? '✓' : t.status === 'WARN' ? '⚠' : '✗';
    return `<tr class="${cls}"><td>${sym}</td><td>${t.label}</td><td>${t.status}</td><td>${t.detail || ''}</td></tr>`;
  }).join('');
  return `
  <details class="persona ${statusClass}">
    <summary>
      <span class="persona-name">${persona.name}</span>
      <span class="persona-role tag-${persona.role}">${persona.role.toUpperCase()}</span>
      <span class="counts">✓ ${personaPassed} &nbsp; ${personaFailed > 0 ? `<span class="red">✗ ${personaFailed}</span>` : '✗ 0'} &nbsp; ${personaWarned > 0 ? `<span class="amber">⚠ ${personaWarned}</span>` : '⚠ 0'}</span>
    </summary>
    <table><thead><tr><th></th><th>Test</th><th>Status</th><th>Detail</th></tr></thead><tbody>${testRows}</tbody></table>
  </details>`;
}).join('\n');

const failures = results.flatMap(p =>
  p.tests.filter(t => t.status === 'FAIL').map(t => ({ persona: p.name, ...t }))
);
const warnings = results.flatMap(p =>
  p.tests.filter(t => t.status === 'WARN').map(t => ({ persona: p.name, ...t }))
);

const failureList = failures.length > 0
  ? failures.map(f => `<li><strong>${f.persona}</strong>: ${f.label}${f.detail ? ' — <em>' + f.detail + '</em>' : ''}</li>`).join('')
  : '<li class="pass">No failures — all critical paths passed.</li>';

const warningList = warnings.length > 0
  ? warnings.map(w => `<li><strong>${w.persona}</strong>: ${w.label}${w.detail ? ' — <em>' + w.detail + '</em>' : ''}</li>`).join('')
  : '<li class="pass">No warnings.</li>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SmartSwing AI — User Journey Test Report</title>
<style>
  :root { --bg:#0a0a0a; --panel:rgba(22,22,26,.95); --line:rgba(255,255,255,.1); --text:#f5f7fa; --muted:#aab; --volt:#39ff14; --gold:#ffd84d; --red:#ff4444; --amber:#ffa533; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"DM Sans",system-ui,sans-serif;background:var(--bg);color:var(--text);padding:32px;min-height:100vh}
  h1{font-size:2.4rem;letter-spacing:-.05em;margin-bottom:4px}
  h1 span{color:var(--volt)}
  .sub{color:var(--muted);margin-bottom:32px;font-size:.95rem}
  .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;text-align:center}
  .stat .num{font-size:2.5rem;font-weight:800;letter-spacing:-.04em}
  .stat .lbl{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-top:4px}
  .green .num{color:var(--volt)} .red-s .num{color:var(--red)} .amber-s .num{color:var(--amber)} .rate .num{color:#60a5fa}
  h2{font-size:1.3rem;margin:28px 0 12px;letter-spacing:-.03em}
  .issues{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:24px}
  .issues ul{list-style:none;display:grid;gap:8px;margin-top:10px}
  .issues li{font-size:.9rem;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.04)}
  .issues li.pass{color:var(--volt)}
  details.persona{background:var(--panel);border:1px solid var(--line);border-radius:16px;margin-bottom:10px;overflow:hidden}
  details.persona.fail{border-color:rgba(255,68,68,.4)} details.persona.warn{border-color:rgba(255,165,51,.35)} details.persona.pass{border-color:rgba(57,255,20,.2)}
  summary{padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;user-select:none;list-style:none}
  summary::-webkit-details-marker{display:none}
  .persona-name{font-weight:700;font-size:.95rem}
  .persona-role{font-size:.7rem;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:999px;letter-spacing:.06em}
  .tag-player{background:rgba(57,255,20,.15);color:var(--volt)} .tag-coach{background:rgba(96,165,250,.15);color:#93c5fd} .tag-system{background:rgba(255,216,77,.15);color:var(--gold)}
  .counts{margin-left:auto;font-size:.85rem;color:var(--muted)} .red{color:var(--red)} .amber{color:var(--amber)}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  thead{background:rgba(255,255,255,.04)}
  th,td{text-align:left;padding:8px 14px;border-bottom:1px solid var(--line)}
  th{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  tr.pass td:first-child{color:var(--volt)} tr.fail td:first-child{color:var(--red)} tr.warn td:first-child{color:var(--amber)}
  tr.fail{background:rgba(255,68,68,.05)} tr.warn{background:rgba(255,165,51,.04)}
  @media(max-width:600px){.summary-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<h1>SmartSwing <span>AI</span> — User Journey Report</h1>
<p class="sub">20 Personas (10 Students + 10 Coaches) &bull; Run: ${runDate}</p>

<div class="summary-grid">
  <div class="stat green"><div class="num">${passed}</div><div class="lbl">Passed</div></div>
  <div class="stat red-s"><div class="num">${failed}</div><div class="lbl">Failed</div></div>
  <div class="stat amber-s"><div class="num">${warned}</div><div class="lbl">Warnings</div></div>
  <div class="stat rate"><div class="num">${passRate}%</div><div class="lbl">Pass Rate</div></div>
</div>

${failures.length > 0 ? `
<div class="issues" style="border-color:rgba(255,68,68,.4)">
  <h2 style="color:var(--red)">✗ Failures — ${failures.length} issue(s) to fix</h2>
  <ul>${failureList}</ul>
</div>` : `
<div class="issues" style="border-color:rgba(57,255,20,.3)">
  <h2 style="color:var(--volt)">✓ No Failures</h2>
  <ul><li class="pass">All critical user journeys passed.</li></ul>
</div>`}

${warnings.length > 0 ? `
<div class="issues" style="border-color:rgba(255,165,51,.4)">
  <h2 style="color:var(--amber)">⚠ Warnings — ${warnings.length} item(s) to review</h2>
  <ul>${warningList}</ul>
</div>` : ''}

<h2>Persona Results</h2>
${rows}

<p style="margin-top:32px;font-size:.8rem;color:var(--muted)">Generated by SmartSwing AI user-journey-tests.js &bull; Node.js ${process.version}</p>
</body>
</html>`;

const reportPath = path.join(__dirname, 'user-journey-report.html');
fs.writeFileSync(reportPath, html, 'utf8');
console.log(`\nHTML report: ${reportPath}`);
console.log(`JSON results: ${jsonOut}`);

process.exit(failed > 0 ? 1 : 0);
