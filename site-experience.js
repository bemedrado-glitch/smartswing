(function () {
  const COOKIE_KEY = 'smartswing_cookie_preferences_v1';

  function initPlanSelection() {
    const store = window.SmartSwingStore;
    document.querySelectorAll('[data-plan-select]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const planId = String(link.dataset.planSelect || '').toLowerCase();
        if (!planId) return;
        const billingInterval = link.dataset.billingInterval || 'monthly';
        if (store?.setCheckoutIntent) {
          store.setCheckoutIntent({
            planId,
            billingInterval,
            source: window.location.pathname || ''
          });
        }
        const destination = store?.getCurrentUser?.() && store?.getCheckoutIntentDestination
          ? store.getCheckoutIntentDestination()
          : link.getAttribute('href');
        if (!destination) return;
        event.preventDefault();
        window.location.href = destination;
      });
    });
  }

  function saveCookiePreferences(preferences) {
    const payload = {
      necessary: true,
      analytics: Boolean(preferences.analytics),
      personalization: Boolean(preferences.personalization),
      marketing: Boolean(preferences.marketing),
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(COOKIE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('smartswing:cookies-updated', { detail: payload }));
  }

  function initCookieBanner() {
    const banner = document.querySelector('[data-cookie-banner]');
    if (!banner) return;
    if (localStorage.getItem(COOKIE_KEY)) {
      banner.hidden = true;
      return;
    }

    banner.hidden = false;
    const acceptBtn = banner.querySelector('[data-cookie-action="accept"]');
    const essentialBtn = banner.querySelector('[data-cookie-action="essential"]');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        saveCookiePreferences({ analytics: true, personalization: true, marketing: true });
        banner.hidden = true;
      });
    }

    if (essentialBtn) {
      essentialBtn.addEventListener('click', () => {
        saveCookiePreferences({ analytics: false, personalization: false, marketing: false });
        banner.hidden = true;
      });
    }
  }

  function preservePlanIntentLinks() {
    const store = window.SmartSwingStore;
    const intent = store?.getCheckoutIntent?.();
    if (!intent?.planId) return;
    document.querySelectorAll('[data-preserve-intent]').forEach((link) => {
      const url = new URL(link.getAttribute('href'), window.location.href);
      url.searchParams.set('plan', intent.planId);
      if (intent.planId !== 'free') {
        url.searchParams.set('interval', intent.billingInterval || 'monthly');
      }
      link.setAttribute('href', `${url.pathname.split('/').pop()}${url.search}`);
    });
  }

  function init() {
    initPlanSelection();
    initCookieBanner();
    preservePlanIntentLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
