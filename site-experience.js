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

  function applyAuthNav(firstName, avatarUrl) {
    var navCta = document.querySelector('.nav-cta');
    if (!navCta) return;
    // Don't overwrite if already transformed
    if (navCta.dataset.authApplied) return;
    navCta.dataset.authApplied = '1';

    var initial = (firstName[0] || 'U').toUpperCase();
    var avatarHtml = avatarUrl
      ? '<img src="' + avatarUrl + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
      : '<span style="width:32px;height:32px;border-radius:50%;background:rgba(57,255,20,.15);color:#39ff14;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">' + initial + '</span>';

    navCta.innerHTML =
      '<a href="./dashboard.html" style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:12px;border:1px solid rgba(57,255,20,.25);background:rgba(57,255,20,.06);color:var(--text,#fff);text-decoration:none;font-size:14px;font-weight:600;transition:border-color .2s;" onmouseenter="this.style.borderColor=\'rgba(57,255,20,.5)\'" onmouseleave="this.style.borderColor=\'rgba(57,255,20,.25)\'">' +
        avatarHtml +
        '<span>' + firstName + '</span>' +
      '</a>';
  }

  function initAuthNav() {
    // Strategy 1: Check SmartSwingStore (pages with app-data.js)
    var store = window.SmartSwingStore;
    if (store && typeof store.getCurrentUser === 'function') {
      var user = store.getCurrentUser();
      if (user) {
        applyAuthNav(
          user.firstName || (user.name ? user.name.split(' ')[0] : '') || 'My Account',
          user.avatarUrl || user.avatar_url || ''
        );
        return;
      }
      // Try restoring session
      if (typeof store.restoreSupabaseSession === 'function') {
        store.restoreSupabaseSession().then(function () {
          var u = store.getCurrentUser();
          if (u) {
            applyAuthNav(
              u.firstName || (u.name ? u.name.split(' ')[0] : '') || 'My Account',
              u.avatarUrl || u.avatar_url || ''
            );
          }
        }).catch(function () {});
        return;
      }
    }

    // Strategy 2: Check Supabase localStorage session directly
    // (works on pages without app-data.js — audience pages, features, etc.)
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('sb-') === 0 && keys[i].indexOf('-auth-token') > 0) {
          var raw = JSON.parse(localStorage.getItem(keys[i]) || '{}');
          var session = raw && raw.user ? raw : (raw.currentSession || null);
          if (session && session.user) {
            var meta = session.user.user_metadata || {};
            var name = meta.full_name || meta.name || session.user.email || 'My Account';
            applyAuthNav(name.split(' ')[0], meta.avatar_url || '');
          }
          break;
        }
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  function init() {
    initPlanSelection();
    initCookieBanner();
    preservePlanIntentLinks();
    initAuthNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
