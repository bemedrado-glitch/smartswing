/**
 * SmartSwing AI — Shared chrome renderer (UI consistency sweep).
 *
 * Single source of truth for the site-wide footer + skip-to-content link.
 * Pages opt in by:
 *   1. Including this file:   <script src="./shared-chrome.js" defer></script>
 *   2. Dropping a placeholder: <div data-ss-footer></div>
 *      — renders a canonical <footer> with the identical markup every page
 *        used to duplicate inline (legal links, columns, copyright year).
 *   3. (Optional) <a data-ss-skip-link>Skip to main content</a>
 *      auto-wired to jump to the first <main>, <main id="*">, or #main-content.
 *
 * The script also auto-injects a skip-link if one isn't present and the page
 * has an obvious main landmark — satisfies WCAG 2.4.1 without per-page edits.
 *
 * Why a JS include (not a server-side include): this is a static site deployed
 * to Vercel; SSI isn't available. Vanilla JS lets every page load the same
 * footer without a build step and without a framework.
 *
 * Zero-dependency, no globals beyond window.SmartSwingChrome.
 */
(function () {
  'use strict';
  if (window.SmartSwingChrome) return;

  var CURRENT_YEAR = new Date().getFullYear(); // Always current — no more 2025/2026 drift.

  // Minimal public-facing header. Used on pages that previously had no nav at
  // all (cart, contact, login, signup, auth-callback, post). Pages with their
  // own custom nav leave `data-ss-header` unset and keep their markup.
  function headerHTML() {
    return (
      '<nav class="ss-shared-nav" aria-label="Main navigation" style="position:sticky;top:0;z-index:100;background:rgba(10,10,10,0.85);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.08);">' +
        '<div style="max-width:1280px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;">' +
          '<a href="./index.html" aria-label="SmartSwing AI - Home" style="display:flex;align-items:center;text-decoration:none;">' +
            '<img src="./assets/logos/logo.png" alt="SmartSwing AI" width="140" height="35">' +
          '</a>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<a href="./pricing.html" style="text-decoration:none;color:rgba(255,255,255,0.65);font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;">Pricing</a>' +
            '<a href="./login.html" style="text-decoration:none;color:rgba(255,255,255,0.65);font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);">Sign in</a>' +
            '<a href="./signup.html" style="text-decoration:none;color:#0a0a0a;background:#39ff14;font-weight:800;font-size:14px;padding:9px 18px;border-radius:999px;">Start free</a>' +
          '</div>' +
        '</div>' +
      '</nav>'
    );
  }

  function footerHTML() {
    return (
      '<footer class="footer" role="contentinfo" aria-label="Site footer">' +
        '<div class="page">' +
          '<div class="footer-grid">' +
            '<div>' +
              '<div class="footer-brand">' +
                '<img src="./assets/logos/logo.png" alt="SmartSwing AI" class="footer-logo" width="140" height="35">' +
              '</div>' +
              '<p class="footer-tagline" data-i18n="footer.tagline">AI-powered tennis analysis for players, coaches, and clubs.</p>' +
            '</div>' +
            '<div>' +
              '<h4 class="footer-heading" data-i18n="footer.product">Product</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="./features.html" data-i18n="nav.features">Features</a></li>' +
                '<li><a href="./pricing.html" data-i18n="nav.pricing">Pricing</a></li>' +
                '<li><a href="./how-it-works.html" data-i18n="nav.howItWorks">How It Works</a></li>' +
                '<li><a href="./blog.html" data-i18n="nav.blog">Blog</a></li>' +
              '</ul>' +
            '</div>' +
            '<div>' +
              '<h4 class="footer-heading" data-i18n="footer.audience">For</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="./for-players.html">Players</a></li>' +
                '<li><a href="./for-coaches.html">Coaches</a></li>' +
                '<li><a href="./for-clubs.html">Clubs</a></li>' +
                '<li><a href="./for-parents.html">Parents</a></li>' +
              '</ul>' +
            '</div>' +
            '<div>' +
              '<h4 class="footer-heading" data-i18n="footer.company">Company</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="./about.html" data-i18n="nav.about">About</a></li>' +
                '<li><a href="./contact.html" data-i18n="nav.contact">Contact</a></li>' +
                '<li><a href="./refer-friends.html">Refer friends</a></li>' +
              '</ul>' +
            '</div>' +
            '<div>' +
              '<h4 class="footer-heading" data-i18n="footer.legal">Legal</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="./privacy-policy.html">Privacy</a></li>' +
                '<li><a href="./user-agreement.html">Terms</a></li>' +
                '<li><a href="./cookie-policy.html">Cookies</a></li>' +
                '<li><a href="./accessibility.html">Accessibility</a></li>' +
                '<li><a href="./refund-policy.html">Refunds</a></li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="footer-bottom">' +
            '<p data-i18n="footer.copyright">&copy; ' + CURRENT_YEAR + ' SmartSwing AI. All rights reserved.</p>' +
          '</div>' +
        '</div>' +
      '</footer>'
    );
  }

  function renderFooter() {
    var slots = document.querySelectorAll('[data-ss-footer]');
    slots.forEach(function (el) { el.outerHTML = footerHTML(); });
  }

  function renderHeader() {
    var slots = document.querySelectorAll('[data-ss-header]');
    slots.forEach(function (el) { el.outerHTML = headerHTML(); });
  }

  function ensureSkipLink() {
    // If the page already has a skip link, leave it alone.
    if (document.querySelector('[data-ss-skip-link], .skip-link, .skip-nav')) return;

    // Only inject when we have a believable main landmark to jump to.
    var target = document.querySelector('main, #main-content, #main');
    if (!target) return;

    if (!target.id) target.id = 'main-content';

    var a = document.createElement('a');
    a.className = 'ss-skip-link';
    a.href = '#' + target.id;
    a.textContent = 'Skip to main content';
    // Minimal inline style so the link works even on pages without a global
    // stylesheet — the `:focus` rule pops it to the top-left of the viewport.
    a.setAttribute('style',
      'position:absolute;left:-999px;top:0;z-index:9999;padding:10px 16px;' +
      'background:#39ff14;color:#0a0a0a;font:700 14px/1 "DM Sans",sans-serif;' +
      'text-decoration:none;border-radius:0 0 8px 0;');
    a.addEventListener('focus', function () { a.style.left = '0'; });
    a.addEventListener('blur',  function () { a.style.left = '-999px'; });
    document.body.insertBefore(a, document.body.firstChild);
  }

  function init() {
    try { renderHeader(); } catch (_) {}
    try { renderFooter(); } catch (_) {}
    try { ensureSkipLink(); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SmartSwingChrome = {
    renderHeader: renderHeader,
    renderFooter: renderFooter,
    headerHTML: headerHTML,
    footerHTML: footerHTML,
    ensureSkipLink: ensureSkipLink
  };
})();
