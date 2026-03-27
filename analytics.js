(function () {
  const COOKIE_KEY = 'smartswing_cookie_preferences_v1';

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  function hasAnalyticsConsent() {
    try {
      const prefs = JSON.parse(localStorage.getItem(COOKIE_KEY) || 'null');
      return Boolean(prefs?.analytics);
    } catch (error) {
      return false;
    }
  }

  function loadVercelAnalytics() {
    if (window.__smartSwingVercelAnalyticsLoaded) return;
    if (!hasAnalyticsConsent()) return;
    const script = document.createElement('script');
    script.defer = true;
    script.src = '/_vercel/insights/script.js';
    script.onload = () => { window.__smartSwingVercelAnalyticsLoaded = true; };
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadVercelAnalytics);
  } else {
    loadVercelAnalytics();
  }

  window.addEventListener('smartswing:cookies-updated', loadVercelAnalytics);
})();
