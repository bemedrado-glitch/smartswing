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

  // Canonical public-facing header. Identical on every marketing page.
  // Pages opt in with <div data-ss-header></div>; pages with their own
  // legacy custom nav should migrate to the placeholder for consistency.
  //
  // The nav item set is the union of every "rich" nav seen across the
  // site as of 2026-04-24 — For Players/Coaches/Clubs + How It Works
  // + Pricing + Blog. Sign in + Start free CTAs on the right. Mobile
  // collapse handled via --ss-nav-compact media queries.
  function headerHTML() {
    var link = function (href, label, i18nKey) {
      return '<a href="' + href + '" class="ss-nav-link"' +
        (i18nKey ? ' data-i18n="' + i18nKey + '"' : '') +
        '>' + label + '</a>';
    };
    var navLinks =
      link('./for-players.html',  'For Players',  'nav.forPlayers') +
      link('./for-coaches.html',  'For Coaches',  'nav.forCoaches') +
      link('./for-clubs.html',    'For Clubs',    'nav.forClubs') +
      link('./how-it-works.html', 'How It Works', 'nav.howItWorks') +
      link('./pricing.html',      'Pricing',      'nav.pricing') +
      link('./blog.html',         'Blog',         'nav.blog');
    return (
      '<nav class="ss-shared-nav" aria-label="Main navigation">' +
        '<div class="ss-shared-nav__inner">' +
          '<a href="./index.html" class="ss-shared-nav__brand" aria-label="SmartSwing AI - Home">' +
            '<img src="./assets/logos/logo.png" alt="SmartSwing AI" width="140" height="35">' +
          '</a>' +
          '<div class="ss-shared-nav__links" id="ssNavLinks">' + navLinks + '</div>' +
          '<div class="ss-shared-nav__cta">' +
            '<a href="./login.html" class="ss-shared-nav__signin" data-i18n="nav.signIn">Sign in</a>' +
            '<a href="./signup.html" class="ss-shared-nav__start" data-i18n="nav.startFree">Start free</a>' +
            '<button type="button" class="ss-shared-nav__burger" aria-label="Open menu" aria-expanded="false" aria-controls="ssMobileMenu" onclick="(function(b){var m=document.getElementById(\'ssMobileMenu\');if(!m)return;var open=m.classList.toggle(\'open\');b.setAttribute(\'aria-expanded\',open?\'true\':\'false\');})(this)">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ss-shared-nav__mobile" id="ssMobileMenu" role="menu">' + navLinks + '</div>' +
      '</nav>'
    );
  }

  // Auto-injected CSS for the canonical header. Idempotent.
  function ensureHeaderCss() {
    if (document.querySelector('style[data-ss-header-css]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-ss-header-css', '1');
    style.textContent = [
      '.ss-shared-nav{position:sticky;top:0;z-index:100;background:rgba(10,10,10,0.85);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.08);font-family:var(--ss-font-body,"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);}',
      '.ss-shared-nav__inner{max-width:1280px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;}',
      '.ss-shared-nav__brand{display:flex;align-items:center;text-decoration:none;flex-shrink:0;}',
      '.ss-shared-nav__brand img{display:block;}',
      '.ss-shared-nav__links{display:flex;align-items:center;gap:2px;flex:1;justify-content:center;}',
      '.ss-shared-nav .ss-nav-link{text-decoration:none;color:rgba(255,255,255,0.72);font-weight:600;font-size:14px;padding:8px 10px;border-radius:999px;transition:color .18s,background .18s;white-space:nowrap;}',
      '.ss-shared-nav .ss-nav-link:hover,.ss-shared-nav .ss-nav-link:focus-visible{color:#fff;background:rgba(255,255,255,0.06);}',
      '.ss-shared-nav__cta{display:flex;align-items:center;gap:8px;flex-shrink:0;}',
      '.ss-shared-nav__signin{text-decoration:none;color:rgba(255,255,255,0.85);font-weight:700;font-size:14px;padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.15);transition:border-color .18s,color .18s;}',
      '.ss-shared-nav__signin:hover{border-color:rgba(255,255,255,0.35);color:#fff;}',
      '.ss-shared-nav__start{text-decoration:none;color:#0a0a0a;background:#39ff14;font-weight:800;font-size:14px;padding:9px 18px;border-radius:999px;transition:transform .18s,box-shadow .18s;white-space:nowrap;}',
      '.ss-shared-nav__start:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(57,255,20,0.25);}',
      '.ss-shared-nav__burger{display:none;background:transparent;border:1px solid rgba(255,255,255,0.15);color:#fff;padding:7px 9px;border-radius:10px;cursor:pointer;}',
      '.ss-shared-nav__burger:hover{border-color:rgba(255,255,255,0.35);}',
      '.ss-shared-nav__mobile{display:none;padding:8px 16px 16px;border-top:1px solid rgba(255,255,255,0.06);flex-direction:column;gap:2px;}',
      '.ss-shared-nav__mobile.open{display:flex;}',
      '.ss-shared-nav__mobile .ss-nav-link{padding:12px 14px;font-size:15px;text-align:left;}',
      // Laptop-friendly breakpoint: keep main links visible down to 720px
      // since most 13" laptops are 1280×800 and the old 900px cutoff hid
      // the nav on anything narrower than that.
      '@media(max-width:720px){.ss-shared-nav__links{display:none;}.ss-shared-nav__burger{display:inline-flex;align-items:center;}.ss-shared-nav__signin{display:none;}}',
      '@media(max-width:360px){.ss-shared-nav__start{padding:8px 12px;font-size:13px;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Auto-inject the canonical footer stylesheet so pages don't each need to
  // remember to `<link rel="stylesheet" href="./shared-footer.css">`. Idempotent.
  function ensureFooterCss() {
    if (document.querySelector('link[data-ss-footer-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './shared-footer.css';
    link.setAttribute('data-ss-footer-css', '1');
    document.head.appendChild(link);
  }

  function footerHTML() {
    return (
      '<footer class="footer ss-footer" role="contentinfo" aria-label="Site footer">' +
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
            // Internal resource links preserved from the previous per-page
            // footers (user feedback: marketing/sales/tech-docs disappeared
            // during the canonical-footer migration in PR #105).
            '<div class="footer-internal">' +
              '<a href="./marketing.html">Marketing Dashboard</a>' +
              '<a href="./deploy/SALES_PLAN_AND_PROJECTIONS.html">Sales Plan</a>' +
              '<a href="./smartswing-technical-docs.html">Technical Docs</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</footer>'
    );
  }

  function renderFooter() {
    var slots = document.querySelectorAll('[data-ss-footer]');
    if (!slots.length) return;
    ensureFooterCss();
    slots.forEach(function (el) { el.outerHTML = footerHTML(); });
  }

  function renderHeader() {
    var slots = document.querySelectorAll('[data-ss-header]');
    if (!slots.length) return;
    ensureHeaderCss();
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
