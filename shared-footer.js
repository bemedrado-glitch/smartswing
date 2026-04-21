/**
 * SmartSwing AI — Shared footer injector (M2 from audit).
 *
 * Problem: 30+ HTML pages each hand-rolled their own <footer>. Copy changes
 * (new policy link, new social, new review CTA) had to be mirrored 30 times.
 * Drift caused accessibility regressions + stale copy on older pages.
 *
 * Pattern: pages add `<div id="ss-footer-mount" data-footer-variant="default"></div>`
 * as the last element before `</body>`. This script injects the canonical
 * footer HTML there.
 *
 * Migration strategy (gradual, safe):
 *   1. New pages use the mount pattern from the start.
 *   2. Existing pages migrate one at a time as they're touched, replacing
 *      their hand-rolled <footer> with the mount div.
 *   3. i18n keys already reference `footer.*` — this script uses the same
 *      data-i18n attributes so i18n.js keeps working.
 *
 * Variants: data-footer-variant
 *   'default'    — full footer with product/audience/trust columns + review CTA
 *   'minimal'    — just © + privacy/terms/cookies links (for auth/app pages)
 *   'none'       — suppress injection (manual/custom footer on this page)
 *
 * The canonical footer content is kept in sync with index.html — if you need
 * to change the footer, change it HERE ONCE, then all mount-using pages
 * pick it up on next deploy.
 */
(function () {
  'use strict';

  function defaultFooter() {
    return `
  <footer class="footer ss-shared-footer" role="contentinfo" aria-label="Site footer">
    <div class="page">
      <div class="footer-grid">
        <div>
          <div class="footer-brand"><img src="./assets/logos/logo.png" alt="SmartSwing AI" class="footer-logo" width="140" height="35"></div>
          <p class="footer-tagline" data-i18n="footer.tagline">AI-powered tennis analysis for players, coaches, and clubs.</p>
        </div>
        <div class="footer-col">
          <strong data-i18n="footer.colProduct">Product</strong>
          <div class="footer-links">
            <a href="./features.html" data-i18n="footer.features">Features</a>
            <a href="./pricing.html" data-i18n="footer.pricing">Pricing</a>
            <a href="./how-it-works.html" data-i18n="footer.howItWorks">How It Works</a>
            <a href="./analyze.html" data-i18n="footer.analyze">Analyze a Swing</a>
          </div>
        </div>
        <div class="footer-col">
          <strong data-i18n="footer.colForYou">For You</strong>
          <div class="footer-links">
            <a href="./for-players.html" data-i18n="footer.players">Players</a>
            <a href="./for-coaches.html" data-i18n="footer.coaches">Coaches</a>
            <a href="./for-clubs.html" data-i18n="footer.clubs">Clubs</a>
            <a href="./for-parents.html" data-i18n="footer.parents">Parents</a>
          </div>
        </div>
        <div class="footer-col">
          <strong data-i18n="footer.colTrust">Trust &amp; Legal</strong>
          <div class="footer-links">
            <a href="./refund-policy.html" data-i18n="footer.refundPolicy">Refund Policy</a>
            <a href="./user-agreement.html" data-i18n="footer.userAgreement">User Agreement</a>
            <a href="./privacy-policy.html" data-i18n="footer.privacyPolicy">Privacy Policy</a>
            <a href="./cookie-policy.html" data-i18n="footer.cookiePolicy">Cookie Policy</a>
            <a href="./accessibility.html" data-i18n="footer.accessibility">Accessibility</a>
            <a href="https://www.instagram.com/smartswing_ai/" target="_blank" rel="noopener" data-i18n="footer.instagram">Instagram</a>
            <a href="https://www.youtube.com/@SmartSwing_AI" target="_blank" rel="noopener" data-i18n="footer.youtube">YouTube</a>
            <a href="https://www.tiktok.com/@smartswingai" target="_blank" rel="noopener" data-i18n="footer.tiktok">TikTok</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p data-i18n="footer.copyright">© 2026 SmartSwing AI. All rights reserved.</p>
        <div class="footer-bottom-links">
          <a href="./privacy-policy.html" data-i18n="footer.privacy">Privacy</a>
          <a href="./user-agreement.html" data-i18n="footer.terms">Terms</a>
          <a href="./cookie-policy.html" data-i18n="footer.cookies">Cookies</a>
        </div>
      </div>
    </div>
  </footer>`;
  }

  function minimalFooter() {
    return `
  <footer class="footer ss-shared-footer ss-shared-footer--minimal" role="contentinfo" aria-label="Site footer" style="padding:24px 0;">
    <div class="page" style="text-align:center;font-size:12px;color:rgba(255,255,255,.35);">
      <p data-i18n="footer.copyright" style="margin-bottom:8px;">© 2026 SmartSwing AI. All rights reserved.</p>
      <div style="display:inline-flex;gap:16px;justify-content:center;">
        <a href="./privacy-policy.html" data-i18n="footer.privacy" style="color:inherit;">Privacy</a>
        <a href="./user-agreement.html" data-i18n="footer.terms" style="color:inherit;">Terms</a>
        <a href="./cookie-policy.html" data-i18n="footer.cookies" style="color:inherit;">Cookies</a>
      </div>
    </div>
  </footer>`;
  }

  function inject() {
    const mount = document.getElementById('ss-footer-mount');
    if (!mount) return;
    const variant = (mount.getAttribute('data-footer-variant') || 'default').toLowerCase();
    if (variant === 'none') return;
    const html = variant === 'minimal' ? minimalFooter() : defaultFooter();
    // Replace the mount div with the footer content (mount is discarded)
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    const footerEl = wrapper.firstElementChild;
    if (footerEl) mount.parentNode.replaceChild(footerEl, mount);

    // Re-run i18n if available so freshly-injected data-i18n nodes get translated
    if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
      try { window.i18n.applyTranslations(); } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Expose for manual triggers (useful in SPA-style contexts)
  window.SmartSwingSharedFooter = { inject };
})();
