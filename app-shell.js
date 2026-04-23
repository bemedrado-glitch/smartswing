/**
 * SmartSwing AI — Canonical app-shell renderer.
 *
 * Renders the topbar + mobile drawer + bottom-nav into pages that opt in
 * with placeholder elements:
 *
 *   <div data-ss-app-topbar></div>
 *   <div data-ss-app-bottom-nav></div>
 *
 * Wires the hamburger ↔ drawer toggle, marks the current page as `.active`
 * in both nav surfaces, and respects reduced-motion via app-shell.css.
 *
 * Pairs with:
 *   - app-shell.css   (visual styles)
 *   - shared-chrome.js (skip-link injector — both load fine together)
 *
 * Pages link this script with `defer` so DOM is ready when init runs.
 *
 * Why JS instead of static markup: lets the 5 logged-in tool pages (dashboard,
 * analyze, library, settings, coach-dashboard) share ONE source of truth for
 * chrome the same way marketing pages now share shared-footer.
 */
(function () {
  'use strict';
  if (window.SmartSwingAppShell) return;

  // Canonical app-page nav inventory. Update once here, propagates everywhere.
  // `match` is a substring tested against the current pathname so /dashboard.html
  // and /dashboard both highlight the right tab.
  var NAV_ITEMS = [
    { href: './dashboard.html',       label: 'Dashboard',  match: 'dashboard.html',       icon: 'home'    },
    { href: './analyze.html',         label: 'Analyze',    match: 'analyze.html',         icon: 'play'    },
    { href: './library.html',         label: 'Library',    match: 'library.html',         icon: 'book'    },
    { href: './blog.html',            label: 'Blog',       match: 'blog.html',            icon: 'news'    },
    { href: './refer-friends.html',   label: 'Refer',      match: 'refer-friends.html',   icon: 'gift'    },
    { href: './settings.html',        label: 'Settings',   match: 'settings.html',        icon: 'gear'    }
  ];

  function iconSvg(name) {
    var paths = {
      home: '<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>',
      play: '<polygon points="5 3 19 12 5 21 5 3"/>',
      book: '<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M4 16a4 4 0 0 1 4-4h12"/>',
      news: '<path d="M4 4h12a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z"/><line x1="8" y1="9"  x2="14" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/>',
      gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    };
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
  }

  function isActive(item, currentPath) {
    return currentPath.indexOf(item.match) >= 0;
  }

  function topbarHTML(currentPath) {
    var navHtml = NAV_ITEMS.map(function (it) {
      var active = isActive(it, currentPath) ? ' class="active" aria-current="page"' : '';
      return '<a href="' + it.href + '"' + active + '>' + it.label + '</a>';
    }).join('');

    var hamburgerSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';

    return (
      '<header class="app-topbar" role="banner">' +
        '<div class="app-topbar-inner">' +
          // Logo → home page (standard web convention). Users reported being
          // unable to return to the public homepage from within the app;
          // previously this linked to ./dashboard.html which just kept them
          // in the app-shell. Now one click on the logo exits to marketing.
          '<a class="app-topbar-brand" href="./index.html" aria-label="SmartSwing AI — back to home">' +
            '<img src="./assets/logos/logo.png" alt="SmartSwing AI">' +
          '</a>' +
          '<nav class="app-topbar-nav" aria-label="Main navigation">' + navHtml + '</nav>' +
          '<button class="app-topbar-hamburger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="ss-mobile-drawer" data-ss-drawer-toggle>' + hamburgerSvg + '</button>' +
        '</div>' +
      '</header>'
    );
  }

  function drawerHTML(currentPath) {
    var navHtml = NAV_ITEMS.map(function (it) {
      var active = isActive(it, currentPath) ? ' class="active" aria-current="page"' : '';
      return '<a href="' + it.href + '"' + active + '>' + it.label + '</a>';
    }).join('');

    return (
      '<div class="app-mobile-drawer" id="ss-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile navigation" hidden>' +
        '<button class="app-mobile-drawer-close" type="button" aria-label="Close menu" data-ss-drawer-close>&times;</button>' +
        navHtml +
      '</div>'
    );
  }

  function bottomNavHTML(currentPath) {
    return (
      '<nav class="app-bottom-nav" aria-label="App navigation">' +
        NAV_ITEMS.map(function (it) {
          var active = isActive(it, currentPath) ? ' class="active" aria-current="page"' : '';
          return '<a href="' + it.href + '"' + active + '>' + iconSvg(it.icon) + '<span>' + it.label + '</span></a>';
        }).join('') +
      '</nav>'
    );
  }

  function renderInto(selector, html) {
    var slot = document.querySelector(selector);
    if (!slot) return;
    slot.outerHTML = html;
  }

  function wireDrawer() {
    var toggle = document.querySelector('[data-ss-drawer-toggle]');
    var drawer = document.getElementById('ss-mobile-drawer');
    var closeBtn = document.querySelector('[data-ss-drawer-close]');
    if (!toggle || !drawer) return;

    function open() {
      drawer.classList.add('is-open');
      drawer.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      // Move focus into the drawer for keyboard users.
      if (closeBtn) closeBtn.focus();
    }
    function close() {
      drawer.classList.remove('is-open');
      drawer.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }

    toggle.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Dismiss on ESC for keyboard users.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });

    // Auto-close when navigating via a drawer link.
    drawer.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') close();
    });
  }

  function init() {
    var currentPath = (location.pathname || '') + (location.hash || '');
    var hasTopbarSlot     = !!document.querySelector('[data-ss-app-topbar]');
    var hasBottomNavSlot  = !!document.querySelector('[data-ss-app-bottom-nav]');

    if (hasTopbarSlot) {
      renderInto('[data-ss-app-topbar]', topbarHTML(currentPath));
      // Drawer is always rendered alongside the topbar for the hamburger to control.
      document.body.insertAdjacentHTML('afterbegin', drawerHTML(currentPath));
      wireDrawer();
    }
    if (hasBottomNavSlot) {
      renderInto('[data-ss-app-bottom-nav]', bottomNavHTML(currentPath));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SmartSwingAppShell = {
    NAV_ITEMS: NAV_ITEMS,
    topbarHTML: topbarHTML,
    bottomNavHTML: bottomNavHTML,
    drawerHTML: drawerHTML
  };
})();
