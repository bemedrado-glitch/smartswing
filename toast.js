/**
 * SmartSwing AI — Global toast notifier (Tier 2 #5 from audit).
 *
 * Replaces `alert()` calls with non-blocking, accessible, queued
 * notifications. Pairs with toast.css.
 *
 * Public API on `window.SmartSwingToast`:
 *   show(msg, { type, title, duration, action })  — generic
 *   success(msg, opts)
 *   error(msg, opts)
 *   warn(msg, opts)
 *   info(msg, opts)
 *   dismissAll()
 *
 * Options:
 *   type:     'success' | 'error' | 'warn' | 'info'     (default: 'info')
 *   title:    optional bold title above the body text
 *   duration: ms before auto-dismiss (default: 5000; 0 = persistent)
 *   action:   { label, href?, onClick?() }              optional CTA button
 *
 * Additional helper for form inline errors:
 *   window.SmartSwingToast.fieldError(inputEl, message)
 *   window.SmartSwingToast.fieldClear(inputEl)
 *
 * Accessibility:
 *   - ARIA live region announces every toast (polite by default,
 *     'assertive' for errors)
 *   - Focus stays on the triggering element — toasts never steal focus
 *   - prefers-reduced-motion respected in paired toast.css
 *   - ESC dismisses the most recent toast
 */
(function () {
  'use strict';

  if (window.SmartSwingToast) return; // idempotent

  var MAX_STACK = 5;          // cap concurrent toasts so spam doesn't flood
  var DEFAULT_DURATION = 5000;

  var wrap = null;
  var liveRegion = null;
  var queue = [];             // { msg, opts, el }

  function ensureWrap() {
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.className = 'ss-toast-wrap';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(wrap);

    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    document.body.appendChild(liveRegion);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && queue.length > 0) dismiss(queue[queue.length - 1]);
    });
    return wrap;
  }

  function iconSvg(type) {
    var paths = {
      success: '<polyline points="20 6 9 17 4 12"></polyline>',
      error:   '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      warn:    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
      info:    '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };
    var body = paths[type] || paths.info;
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(msg, opts) {
    opts = opts || {};
    ensureWrap();

    // Cap the stack — drop the oldest if we're over the limit
    while (queue.length >= MAX_STACK) dismiss(queue[0]);

    var type = ['success', 'error', 'warn', 'info'].indexOf(opts.type) >= 0 ? opts.type : 'info';
    var duration = (opts.duration === 0) ? 0 : (typeof opts.duration === 'number' ? opts.duration : DEFAULT_DURATION);

    var el = document.createElement('div');
    el.className = 'ss-toast ss-toast--' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    var actionHtml = '';
    if (opts.action) {
      if (opts.action.href) {
        actionHtml = '<a class="ss-toast__action" href="' + escHtml(opts.action.href) + '">' + escHtml(opts.action.label || 'Action') + '</a>';
      } else {
        actionHtml = '<button class="ss-toast__action" type="button" data-ss-toast-action>' + escHtml(opts.action.label || 'Action') + '</button>';
      }
    }

    el.innerHTML =
      '<span class="ss-toast__icon">' + iconSvg(type) + '</span>' +
      '<div class="ss-toast__body">' +
        (opts.title ? '<div class="ss-toast__title">' + escHtml(opts.title) + '</div>' : '') +
        '<div class="ss-toast__msg">' + escHtml(msg) + '</div>' +
        actionHtml +
      '</div>' +
      '<button class="ss-toast__close" type="button" aria-label="Dismiss notification">&times;</button>';

    var entry = { el: el, timeout: null };
    queue.push(entry);
    wrap.appendChild(el);

    // Announce via live region (uses assertive for errors, polite otherwise)
    liveRegion.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    liveRegion.textContent = (opts.title ? opts.title + ': ' : '') + msg;

    // Wire up close + action handlers
    el.querySelector('.ss-toast__close').addEventListener('click', function () { dismiss(entry); });
    var actionBtn = el.querySelector('[data-ss-toast-action]');
    if (actionBtn && opts.action && typeof opts.action.onClick === 'function') {
      actionBtn.addEventListener('click', function () {
        try { opts.action.onClick(); } catch (_) {}
        dismiss(entry);
      });
    }

    if (duration > 0) {
      entry.timeout = setTimeout(function () { dismiss(entry); }, duration);
    }

    return {
      dismiss: function () { dismiss(entry); },
      el: el
    };
  }

  function dismiss(entry) {
    if (!entry) return;
    if (entry.timeout) clearTimeout(entry.timeout);
    var idx = queue.indexOf(entry);
    if (idx >= 0) queue.splice(idx, 1);
    entry.el.classList.add('is-leaving');
    setTimeout(function () {
      if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    }, 200);
  }

  function dismissAll() {
    queue.slice().forEach(dismiss);
  }

  // Inline form-field error helpers (companion to the toast)
  function fieldError(input, message) {
    if (!input) return;
    input.classList.add('ss-field-invalid');
    input.setAttribute('aria-invalid', 'true');
    var errId = input.id ? input.id + '-error' : null;
    var errEl = errId ? document.getElementById(errId) : null;
    if (!errEl) {
      errEl = document.createElement('span');
      errEl.className = 'ss-form-error';
      if (errId) errEl.id = errId;
      errEl.setAttribute('role', 'alert');
      if (input.parentNode) input.parentNode.insertBefore(errEl, input.nextSibling);
    }
    errEl.textContent = message || '';
    if (errId) input.setAttribute('aria-describedby', errId);
  }

  function fieldClear(input) {
    if (!input) return;
    input.classList.remove('ss-field-invalid');
    input.removeAttribute('aria-invalid');
    var errId = input.id ? input.id + '-error' : null;
    var errEl = errId ? document.getElementById(errId) : null;
    if (errEl) errEl.textContent = '';
  }

  window.SmartSwingToast = {
    show: show,
    success: function (msg, opts) { return show(msg, Object.assign({ type: 'success' }, opts || {})); },
    error:   function (msg, opts) { return show(msg, Object.assign({ type: 'error' },   opts || {})); },
    warn:    function (msg, opts) { return show(msg, Object.assign({ type: 'warn' },    opts || {})); },
    info:    function (msg, opts) { return show(msg, Object.assign({ type: 'info' },    opts || {})); },
    dismissAll: dismissAll,
    fieldError: fieldError,
    fieldClear: fieldClear
  };
})();
