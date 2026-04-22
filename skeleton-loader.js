/**
 * SmartSwing AI — Skeleton loader utility (S9).
 *
 * Pages register their "hydration-sensitive" containers via:
 *   <div id="recentReportsList" data-skeleton="list-row" data-skeleton-count="4"></div>
 *
 * On DOMContentLoaded we inject skeleton placeholders; page JS later
 * calls SmartSwingSkeleton.clear(id) or replaces innerHTML (which
 * naturally wipes the skeletons) when real content is ready.
 *
 * Supported types (match CSS classes in skeleton-loader.css):
 *   'list-row'   — 56px horizontal rows
 *   'card'       — 120px card
 *   'kpi'        — 96px KPI tile
 *   'text'       — small text line
 *   'heading'    — heading-width block
 *
 * data-skeleton-count — how many to render (default 3)
 * data-skeleton-timeout — ms after which skeletons auto-clear (default 10000)
 *   Safety net: if page JS forgets to replace innerHTML, user doesn't see
 *   an infinitely pulsing ghost. At timeout we replace with an empty state.
 */
(function () {
  'use strict';

  var DEFAULT_COUNT = 3;
  var DEFAULT_TIMEOUT_MS = 10000;

  function renderSkeletons(el) {
    var type = (el.getAttribute('data-skeleton') || 'list-row').trim();
    var count = parseInt(el.getAttribute('data-skeleton-count') || DEFAULT_COUNT, 10);
    if (!Number.isFinite(count) || count < 1) count = DEFAULT_COUNT;
    if (count > 20) count = 20;

    // Don't overwrite if the container already has real content
    if (el.children.length > 0 && !el.hasAttribute('data-skeleton-rendered')) return;

    var html = '';
    for (var i = 0; i < count; i++) {
      html += '<div class="ss-skeleton ss-skeleton--' + type + '" aria-hidden="true"></div>';
    }
    el.innerHTML = html;
    el.setAttribute('data-skeleton-rendered', '1');

    // Safety timeout — clear if page JS never replaces
    var timeout = parseInt(el.getAttribute('data-skeleton-timeout') || DEFAULT_TIMEOUT_MS, 10);
    if (Number.isFinite(timeout) && timeout > 0) {
      setTimeout(function () {
        // Only clear if it's STILL just skeletons — don't wipe real content that arrived
        if (el.getAttribute('data-skeleton-rendered') === '1' && el.querySelector('.ss-skeleton')) {
          el.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,.45);font-size:13px;">Still loading… if this persists, refresh the page.</div>';
          el.removeAttribute('data-skeleton-rendered');
        }
      }, timeout);
    }
  }

  function init() {
    var targets = document.querySelectorAll('[data-skeleton]');
    for (var i = 0; i < targets.length; i++) {
      renderSkeletons(targets[i]);
    }
  }

  /** Explicit clear — call when you KNOW the container is about to be replaced. */
  function clear(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el && el.getAttribute('data-skeleton-rendered') === '1') {
      el.removeAttribute('data-skeleton-rendered');
    }
  }

  /** Manual re-init — pages that add new [data-skeleton] elements dynamically. */
  function refresh() { init(); }

  window.SmartSwingSkeleton = { init: init, clear: clear, refresh: refresh };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
