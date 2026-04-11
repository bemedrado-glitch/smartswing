(function () {
  const COOKIE_KEY = 'smartswing_cookie_preferences_v1';
  const SESSION_KEY = 'smartswing_session_id';

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  /* ── Session ID (anonymous, per-tab session) ── */
  function getSessionId() {
    var sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  }

  /* ── Cookie consent ── */
  function hasAnalyticsConsent() {
    try {
      const prefs = JSON.parse(localStorage.getItem(COOKIE_KEY) || 'null');
      return Boolean(prefs?.analytics);
    } catch (error) {
      return false;
    }
  }

  /* ── Vercel Analytics ── */
  function loadVercelAnalytics() {
    if (window.__smartSwingVercelAnalyticsLoaded) return;
    if (!hasAnalyticsConsent()) return;
    const script = document.createElement('script');
    script.defer = true;
    script.src = '/_vercel/insights/script.js';
    script.onload = () => { window.__smartSwingVercelAnalyticsLoaded = true; };
    document.head.appendChild(script);
  }

  /* ── Supabase Event Tracking ── */
  function getSupabaseConfig() {
    var cfg = window.SMARTSWING_SUPABASE_CONFIG;
    if (cfg && cfg.url && cfg.anonKey) return cfg;
    return null;
  }

  function trackEvent(eventType, metadata) {
    if (!hasAnalyticsConsent()) return;
    var cfg = getSupabaseConfig();
    if (!cfg) return;

    var payload = {
      event_type: eventType,
      page_path: window.location.pathname,
      referrer: document.referrer || null,
      session_id: getSessionId(),
      metadata: metadata || {}
    };

    // Add UTM params if present
    var params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (key) {
      var val = params.get(key);
      if (val) payload.metadata[key] = val;
    });

    // Fire-and-forget POST to Supabase REST API
    fetch(cfg.url + '/rest/v1/analytics_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).catch(function () { /* silent */ });
  }

  /* ── Track page view on load ── */
  function trackPageView() {
    trackEvent('page_view', {
      title: document.title,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight
    });
  }

  /* ── Track CTA clicks ── */
  function initClickTracking() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('a[href], button');
      if (!el) return;

      // Track CTA buttons (primary action buttons)
      var isCta = el.classList.contains('cta-btn') ||
                  el.classList.contains('cta-v2-btn') ||
                  el.classList.contains('wt-btn-primary') ||
                  el.dataset.track;
      if (isCta) {
        trackEvent('cta_click', {
          text: (el.textContent || '').trim().slice(0, 80),
          href: el.href || null,
          id: el.id || null,
          track_label: el.dataset.track || null
        });
      }
    });
  }

  /* ── Meta Pixel ── */
  var META_PIXEL_ID = '724180587440946';

  function loadMetaPixel() {
    if (window.__smartSwingMetaPixelLoaded) return;
    if (!hasAnalyticsConsent()) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
    window.__smartSwingMetaPixelLoaded = true;
  }

  /* ── Public API ── */
  window.SmartSwingAnalytics = {
    track: trackEvent
  };

  /* ── Init ── */
  function init() {
    loadVercelAnalytics();
    loadMetaPixel();
    trackPageView();
    initClickTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('smartswing:cookies-updated', function () {
    loadVercelAnalytics();
    loadMetaPixel();
    // Re-track page view if consent was just granted
    if (hasAnalyticsConsent()) trackPageView();
  });
})();
