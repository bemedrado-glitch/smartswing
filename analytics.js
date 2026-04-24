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

  /* ── Google Analytics 4 (GA4) ── */
  var GA4_MEASUREMENT_ID = 'G-9H6LNGBYKT';

  function loadGA4() {
    if (window.__smartSwingGA4Loaded) return;
    if (!hasAnalyticsConsent()) return;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_MEASUREMENT_ID;
    script.onload = function () {
      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', GA4_MEASUREMENT_ID, { send_page_view: true });
      window.__smartSwingGA4Loaded = true;
    };
    document.head.appendChild(script);
  }

  /* ── Meta Pixel ── */
  // Prefer runtime-configured pixel id (from api/runtime-config.js → window.SMARTSWING_META_PIXEL_ID),
  // fall back to the historical hardcoded id so existing tracking keeps working.
  var META_PIXEL_ID_FALLBACK = '724180587440946';
  function getMetaPixelId() {
    var id = (typeof window.SMARTSWING_META_PIXEL_ID === 'string' ? window.SMARTSWING_META_PIXEL_ID : '').trim();
    return id || META_PIXEL_ID_FALLBACK;
  }

  function loadMetaPixel() {
    if (window.__smartSwingMetaPixelLoaded) return;
    if (!hasAnalyticsConsent()) return;
    var pid = getMetaPixelId();
    if (!pid) return; // graceful noop if neither runtime nor fallback is configured
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', pid);
    fbq('track', 'PageView');
    window.__smartSwingMetaPixelLoaded = true;
    // Flush any queued conversion events (fired before pixel loaded / consent granted)
    if (Array.isArray(window.__smartSwingPendingFbq)) {
      window.__smartSwingPendingFbq.forEach(function (args) {
        try { fbq.apply(null, args); } catch (_) { /* silent */ }
      });
      window.__smartSwingPendingFbq.length = 0;
    }
  }

  /* ── Unified conversion-event helper ──
   * Safe to call any time; queues Meta Pixel calls until the pixel loads,
   * and fires GA4 gtag events when gtag is available.
   *
   * When opts.capi === true, also fires the server-side CAPI mirror so
   * the event survives iOS 14+ browser-tracking loss. Same event_id is
   * used on both sides so Meta deduplicates. User PII (email, user id)
   * is hashed server-side; this browser call only forwards what's
   * already public (cookies, current page URL).
   */
  function trackConversion(metaEvent, metaParams, gaEvent, gaParams, opts) {
    opts = opts || {};
    var eventId = opts.eventId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + Math.random().toString(36).slice(2)));
    try {
      if (metaEvent) {
        // eventID is the key to CAPI dedup — fbq accepts it as 4th arg.
        var fbqArgs = ['track', metaEvent];
        if (metaParams) fbqArgs.push(metaParams);
        fbqArgs.push({ eventID: eventId });
        if (window.fbq) {
          window.fbq.apply(null, fbqArgs);
        } else {
          window.__smartSwingPendingFbq = window.__smartSwingPendingFbq || [];
          window.__smartSwingPendingFbq.push(fbqArgs);
        }
      }
      if (gaEvent && typeof window.gtag === 'function') {
        window.gtag('event', gaEvent, gaParams || {});
      }
      // Server-side mirror for opt-in events (conversions that matter for
      // ad attribution). Not called for every PageView — CAPI has per-event
      // quotas and PageView is the noisiest event.
      if (opts.capi && metaEvent) {
        sendToCapi(metaEvent, metaParams, eventId, opts.userData || {});
      }
    } catch (_) { /* silent */ }
    return eventId;
  }

  /**
   * Post a CAPI mirror event. Best-effort, never blocks the UI, never
   * surfaces errors — if the endpoint is misconfigured (503) or down,
   * browser-only tracking degrades gracefully.
   */
  function sendToCapi(eventName, customData, eventId, userData) {
    try {
      // Pull pixel click-id cookies (_fbc, _fbp) — Meta uses them to
      // improve match quality. They're public cookies set by fbevents.js.
      var fbc = _getCookie('_fbc');
      var fbp = _getCookie('_fbp');
      var body = {
        event_name: eventName,
        event_id: eventId,
        event_source_url: window.location.href,
        user_data: Object.assign({}, userData, {
          fbc: fbc || undefined,
          fbp: fbp || undefined,
          client_user_agent: navigator.userAgent
        }),
        custom_data: customData || {}
      };
      // Use sendBeacon when the page is unloading (checkout → thank-you);
      // otherwise fetch keepalive so we don't block navigation.
      var blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
      if (navigator.sendBeacon && document.visibilityState === 'hidden') {
        navigator.sendBeacon('/api/meta-capi', blob);
      } else {
        fetch('/api/meta-capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true
        }).catch(function () { /* silent */ });
      }
    } catch (_) { /* silent */ }
  }

  function _getCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]+)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) { return null; }
  }

  /* ── Public API ── */
  window.SmartSwingAnalytics = {
    track: trackEvent,
    conversion: trackConversion,
    // Expose for pages that want to fire CAPI directly (e.g., signup flows
    // where we already have email + user id in scope).
    capi: function (eventName, customData, userData) {
      var id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
      sendToCapi(eventName, customData, id, userData || {});
      return id;
    }
  };

  /* ── Init ── */
  function init() {
    loadVercelAnalytics();
    loadGA4();
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
    loadGA4();
    loadMetaPixel();
    // Re-track page view if consent was just granted
    if (hasAnalyticsConsent()) trackPageView();
  });
})();
