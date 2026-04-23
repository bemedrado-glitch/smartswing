/**
 * SmartSwing AI — "Scoring changed" one-time notice.
 *
 * Context: PR #121 removed the stacked motivational bonuses (age +5,
 * rating +3, curve boost, per-level floor 38-60) that were inflating
 * the overallScore by 10-15 points on average. Scores are now honest
 * — but users who had a 85 before will see 72 after, and the natural
 * first reaction is "something broke."
 *
 * This module surfaces a dismiss-once modal the first time a legacy
 * user opens a page that shows scores, explaining why scores shifted.
 * Without this mitigation, honest scoring looks like a regression.
 *
 * Usage:
 *   <link rel="stylesheet" href="./scoring-changed-notice.css">
 *   <script src="./scoring-changed-notice.js" defer></script>
 * On `DOMContentLoaded`, the script checks:
 *   1. Is the current user eligible? (has at least 1 assessment older
 *      than the scoring change, AND hasn't dismissed the notice)
 *   2. If yes, inject the modal + bind dismiss handlers.
 * Localstorage keys are scoped to user.id so each profile on a shared
 * device sees the notice once.
 *
 * Public API on window.SmartSwingScoringNotice:
 *   showIfEligible()  — idempotent trigger; called automatically on load
 *   forceShow()       — manual trigger for QA / testing
 *   dismiss()         — programmatic dismiss (e.g. from settings)
 */
(function () {
  'use strict';
  if (window.SmartSwingScoringNotice) return;

  // PR #121 merged at 2026-04-23T17:35:47Z. Any assessment created before
  // this timestamp was scored by the old (inflated) algorithm. Use this
  // as the cutoff for "has prior score under the old system".
  var SCORING_CHANGE_AT = '2026-04-23T17:35:47Z';
  var DISMISS_PREFIX = 'ss:scoring-changed-dismissed:';

  function isEligible() {
    var store = window.SmartSwingStore;
    if (!store || !store.getCurrentUser) return false;
    var user = store.getCurrentUser();
    if (!user || !user.id) return false;

    // Already dismissed — never show again for this user.
    try {
      if (localStorage.getItem(DISMISS_PREFIX + user.id) === '1') return false;
    } catch (_) {}

    // Only show to users who have at least one assessment dated BEFORE
    // the scoring change. Brand-new users will get the new algorithm
    // from their first report and don't need the explanation.
    if (!store.getAssessments) return false;
    var assessments = store.getAssessments() || [];
    var cutoff = new Date(SCORING_CHANGE_AT).getTime();
    return assessments.some(function (a) {
      if (!a || a.userId !== user.id) return false;
      var ts = new Date(a.createdAt || a.timestamp || 0).getTime();
      return ts > 0 && ts < cutoff;
    });
  }

  function modalHtml() {
    return (
      '<div class="ss-scoring-changed" role="dialog" aria-modal="true" aria-labelledby="ss-sc-title">' +
        '<div class="ss-scoring-changed__backdrop" data-ss-sc-dismiss></div>' +
        '<div class="ss-scoring-changed__panel">' +
          '<button type="button" class="ss-scoring-changed__close" aria-label="Dismiss" data-ss-sc-dismiss>&times;</button>' +
          '<div class="ss-scoring-changed__icon" aria-hidden="true">📊</div>' +
          '<h2 id="ss-sc-title" class="ss-scoring-changed__title">We improved how scores are calculated</h2>' +
          '<p class="ss-scoring-changed__body">' +
            'Your coach feedback matched what we were hearing: scores were slightly generous, and two very different swings sometimes landed within a point or two. ' +
            'We tightened the math so the <strong>number reflects mechanics honestly</strong> — and kept the encouraging tone in the narrative next to it.' +
          '</p>' +
          '<div class="ss-scoring-changed__list">' +
            '<div class="ss-scoring-changed__item">' +
              '<span class="ss-scoring-changed__dot"></span>' +
              '<div><strong>Scores may look lower.</strong> That\'s not a regression — the old number was inflated by motivational bonuses that hid real differences in swings.</div>' +
            '</div>' +
            '<div class="ss-scoring-changed__item">' +
              '<span class="ss-scoring-changed__dot"></span>' +
              '<div><strong>Rankings are more accurate.</strong> A cleaner swing now scores visibly higher than a bad one — the gap isn\'t masked by age / rating bonuses anymore.</div>' +
            '</div>' +
            '<div class="ss-scoring-changed__item">' +
              '<span class="ss-scoring-changed__dot"></span>' +
              '<div><strong>Feedback is more personal.</strong> Same metric now reads differently for a youth on their first session vs a senior on their 20th — tailored to your specific deviation, tone, and history.</div>' +
            '</div>' +
          '</div>' +
          '<div class="ss-scoring-changed__actions">' +
            '<button type="button" class="ss-scoring-changed__cta" data-ss-sc-dismiss>Got it, continue</button>' +
            '<a class="ss-scoring-changed__link" href="./blog.html#scoring-honesty" data-ss-sc-dismiss>Read the full explainer →</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function dismiss(userId) {
    try {
      if (userId) localStorage.setItem(DISMISS_PREFIX + userId, '1');
    } catch (_) {}
    var el = document.querySelector('.ss-scoring-changed');
    if (!el) return;
    el.classList.add('is-closing');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      document.body.style.overflow = '';
    }, 200);
  }

  function show() {
    if (document.querySelector('.ss-scoring-changed')) return; // already open
    var user = window.SmartSwingStore && window.SmartSwingStore.getCurrentUser
      ? window.SmartSwingStore.getCurrentUser()
      : null;
    var userId = user && user.id ? user.id : 'anonymous';

    document.body.insertAdjacentHTML('beforeend', modalHtml());
    document.body.style.overflow = 'hidden';

    var root = document.querySelector('.ss-scoring-changed');
    if (!root) return;

    root.querySelectorAll('[data-ss-sc-dismiss]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        // External link click still dismisses (user acknowledged), but
        // lets the navigation happen — so don't preventDefault on <a>.
        dismiss(userId);
      });
    });

    // ESC key dismiss.
    var onKey = function (e) {
      if (e.key === 'Escape') {
        dismiss(userId);
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);

    // Focus the primary CTA for keyboard users.
    var cta = root.querySelector('.ss-scoring-changed__cta');
    if (cta) setTimeout(function () { cta.focus(); }, 50);
  }

  function showIfEligible() {
    try { if (isEligible()) show(); } catch (_) {}
  }

  // Wait for DOM + store readiness before deciding.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(showIfEligible, 300); // small delay so store hydrates
    });
  } else {
    setTimeout(showIfEligible, 300);
  }

  window.SmartSwingScoringNotice = {
    showIfEligible: showIfEligible,
    forceShow: show,
    dismiss: function () {
      var user = window.SmartSwingStore && window.SmartSwingStore.getCurrentUser
        ? window.SmartSwingStore.getCurrentUser()
        : null;
      dismiss(user && user.id ? user.id : 'anonymous');
    },
    SCORING_CHANGE_AT: SCORING_CHANGE_AT
  };
})();
