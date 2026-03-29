/**
 * SmartSwing AI — Mobile Navigation
 * Injects a hamburger button + slide-in drawer for mobile viewports.
 * Works with any page that has the standard .nav-inner / .nav-links / .nav-cta structure.
 */
(function () {
  'use strict';

  var CSS = [
    /* ── hamburger button ── */
    '.ss-hamburger{display:none;flex-direction:column;justify-content:center;align-items:center;',
      'width:44px;height:44px;border:none;background:transparent;cursor:pointer;gap:5px;',
      'border-radius:10px;transition:background 0.2s;-webkit-tap-highlight-color:transparent;}',
    '.ss-hamburger:hover,.ss-hamburger:focus{background:rgba(255,255,255,0.07);outline:2px solid rgba(57,255,20,0.5);}',
    '.ss-hamburger span{display:block;width:22px;height:2px;background:#f5f5f7;border-radius:2px;',
      'transition:transform 0.28s cubic-bezier(.4,0,.2,1),opacity 0.2s,width 0.2s;}',
    '.ss-hamburger[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg);}',
    '.ss-hamburger[aria-expanded="true"] span:nth-child(2){opacity:0;width:0;}',
    '.ss-hamburger[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg);}',

    /* ── drawer overlay ── */
    '#ss-mobile-drawer{',
      'position:fixed;inset:0;z-index:850;',
      'display:flex;flex-direction:column;',
      'background:rgba(8,8,10,0.97);',
      'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);',
      'padding:80px 28px 40px;',
      'transform:translateX(100%);',
      'transition:transform 0.32s cubic-bezier(.4,0,.2,1);',
      'overflow-y:auto;}',
    '#ss-mobile-drawer.open{transform:translateX(0);}',

    /* ── drawer links ── */
    '#ss-mobile-drawer .ss-mob-links{list-style:none;display:flex;flex-direction:column;gap:2px;margin-bottom:32px;}',
    '#ss-mobile-drawer .ss-mob-links a{',
      'display:flex;align-items:center;',
      'padding:16px 4px;',
      'font-size:22px;font-weight:700;letter-spacing:-0.3px;',
      'color:#f5f5f7;text-decoration:none;',
      'border-bottom:1px solid rgba(255,255,255,0.07);',
      'transition:color 0.18s,padding-left 0.18s;}',
    '#ss-mobile-drawer .ss-mob-links a:hover,#ss-mobile-drawer .ss-mob-links a:focus{color:#39ff14;padding-left:8px;}',

    /* ── drawer CTA buttons ── */
    '#ss-mobile-drawer .ss-mob-cta{display:flex;flex-direction:column;gap:12px;}',
    '#ss-mobile-drawer .ss-mob-cta a{',
      'display:block;text-align:center;padding:16px 24px;border-radius:12px;',
      'font-size:16px;font-weight:700;text-decoration:none;transition:0.18s;}',
    '#ss-mobile-drawer .ss-mob-cta .ss-mob-signin{',
      'background:transparent;color:#f5f5f7;',
      'border:1px solid rgba(255,255,255,0.2);}',
    '#ss-mobile-drawer .ss-mob-cta .ss-mob-signin:hover{border-color:rgba(255,255,255,0.4);}',
    '#ss-mobile-drawer .ss-mob-cta .ss-mob-start{',
      'background:#39ff14;color:#0a0a0a;',
      'box-shadow:0 0 24px rgba(57,255,20,0.3);}',
    '#ss-mobile-drawer .ss-mob-cta .ss-mob-start:hover{background:#2bcc0f;}',

    /* ── show hamburger below 900px ── */
    '@media(max-width:900px){',
      '.ss-hamburger{display:flex;}',
      '.nav-cta .btn-ghost,.nav-cta .btn-primary{display:none;}',
    '}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('ss-mobile-nav-style')) return;
    var style = document.createElement('style');
    style.id = 'ss-mobile-nav-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function getNavLinks() {
    var links = [];
    document.querySelectorAll('.nav-links a').forEach(function (a) {
      links.push({ href: a.getAttribute('href') || '#', text: a.textContent.trim() });
    });
    return links;
  }

  function getCtaLinks() {
    var ctas = { signin: null, start: null };
    document.querySelectorAll('.nav-cta a').forEach(function (a) {
      var href = a.getAttribute('href') || '#';
      var text = a.textContent.trim();
      if (href.indexOf('login') !== -1 || href.indexOf('signin') !== -1) ctas.signin = { href: href, text: text };
      else if (href.indexOf('signup') !== -1 || href.indexOf('start') !== -1 || href.indexOf('register') !== -1) ctas.start = { href: href, text: text };
    });
    // fallback guesses
    if (!ctas.signin) ctas.signin = { href: './login.html', text: 'Sign In' };
    if (!ctas.start)  ctas.start  = { href: './signup.html', text: 'Get Started Free' };
    return ctas;
  }

  function buildDrawer() {
    var links = getNavLinks();
    var ctas  = getCtaLinks();

    var drawer = document.createElement('nav');
    drawer.id = 'ss-mobile-drawer';
    drawer.setAttribute('aria-label', 'Mobile navigation');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');

    // Nav links list
    var ul = document.createElement('ul');
    ul.className = 'ss-mob-links';
    links.forEach(function (l) {
      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href = l.href;
      a.textContent = l.text;
      a.addEventListener('click', closeDrawer);
      li.appendChild(a);
      ul.appendChild(li);
    });
    drawer.appendChild(ul);

    // CTA buttons
    var ctaDiv = document.createElement('div');
    ctaDiv.className = 'ss-mob-cta';
    var signInA = document.createElement('a');
    signInA.href = ctas.signin.href;
    signInA.textContent = ctas.signin.text;
    signInA.className = 'ss-mob-signin';
    signInA.addEventListener('click', closeDrawer);
    var startA = document.createElement('a');
    startA.href = ctas.start.href;
    startA.textContent = ctas.start.text;
    startA.className = 'ss-mob-start';
    startA.addEventListener('click', closeDrawer);
    ctaDiv.appendChild(signInA);
    ctaDiv.appendChild(startA);
    drawer.appendChild(ctaDiv);

    return drawer;
  }

  var hamburger, drawer;

  function openDrawer() {
    drawer.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    // focus first link for accessibility
    var firstLink = drawer.querySelector('a');
    if (firstLink) firstLink.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    hamburger.focus();
  }

  function buildHamburger() {
    var btn = document.createElement('button');
    btn.className = 'ss-hamburger';
    btn.setAttribute('aria-label', 'Open navigation menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'ss-mobile-drawer');
    btn.setAttribute('type', 'button');
    for (var i = 0; i < 3; i++) {
      var s = document.createElement('span');
      s.setAttribute('aria-hidden', 'true');
      btn.appendChild(s);
    }
    btn.addEventListener('click', function () {
      if (drawer.classList.contains('open')) closeDrawer();
      else openDrawer();
    });
    return btn;
  }

  function init() {
    injectStyles();

    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return; // no standard nav found

    hamburger = buildHamburger();
    drawer    = buildDrawer();

    // Insert hamburger into nav-inner (last child)
    navInner.appendChild(hamburger);
    // Append drawer to body
    document.body.appendChild(drawer);

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });

    // Close on outside click (overlay)
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer) closeDrawer();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
