/**
 * SmartSwing AI — i18n engine
 * Supports: en, pt-BR, es, de, fr, ru, zh, ja
 * Usage: add data-i18n="key.path" to any element whose textContent should be translated.
 *        add data-i18n-placeholder="key" for input placeholders.
 *        add data-i18n-html="key" where innerHTML replacement is needed.
 */
(function () {
  'use strict';

  var SUPPORTED = ['en', 'pt-BR', 'es', 'de', 'fr', 'ru', 'zh', 'ja'];
  var DEFAULT_LANG = 'en';
  var STORAGE_KEY = 'ss_lang';

  var LANG_META = {
    'en':    { label: 'EN', flag: '🇺🇸', native: 'English' },
    'pt-BR': { label: 'PT', flag: '🇧🇷', native: 'Português' },
    'es':    { label: 'ES', flag: '🇪🇸', native: 'Español' },
    'de':    { label: 'DE', flag: '🇩🇪', native: 'Deutsch' },
    'fr':    { label: 'FR', flag: '🇫🇷', native: 'Français' },
    'ru':    { label: 'RU', flag: '🇷🇺', native: 'Русский' },
    'zh':    { label: 'ZH', flag: '🇨🇳', native: '中文' },
    'ja':    { label: 'JA', flag: '🇯🇵', native: '日本語' }
  };

  function detectLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) {}
    var browser = (navigator.language || navigator.userLanguage || DEFAULT_LANG);
    if (SUPPORTED.indexOf(browser) !== -1) return browser;
    var short = browser.split('-')[0].toLowerCase();
    for (var i = 0; i < SUPPORTED.length; i++) {
      if (SUPPORTED[i].split('-')[0].toLowerCase() === short) return SUPPORTED[i];
    }
    return DEFAULT_LANG;
  }

  function resolve(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o && o[k] !== undefined) ? o[k] : undefined;
    }, obj);
  }

  // L8 (audit) — when ?i18nDebug=1 is present, surface missing keys so
  // translators can see gaps instead of silently leaving English text.
  // Marks missing keys visually AND logs them once per key to console.
  var i18nDebugMode = (function () {
    try { return new URLSearchParams(window.location.search).get('i18nDebug') === '1'; }
    catch (_) { return false; }
  })();
  var _missingKeySeen = {};
  function _reportMissing(key, el) {
    if (!i18nDebugMode) return;
    if (!_missingKeySeen[key]) {
      _missingKeySeen[key] = true;
      console.warn('[i18n] Missing key: "' + key + '"', el);
    }
    el.style.outline = '2px dashed #ff5252';
    el.setAttribute('data-i18n-missing', '1');
    el.setAttribute('title', 'i18n missing: ' + key);
  }

  function applyTranslations(t) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = resolve(t, key);
      if (val !== undefined) el.textContent = val;
      else _reportMissing(key, el);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var val = resolve(t, key);
      if (val !== undefined) el.innerHTML = val;
      else _reportMissing(key, el);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = resolve(t, key);
      if (val !== undefined) el.placeholder = val;
      else _reportMissing(key, el);
    });
  }

  function loadTranslations(lang, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/translations/' + lang + '.json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          callback(null, JSON.parse(xhr.responseText));
        } catch (e) {
          callback(e, {});
        }
      } else if (lang !== DEFAULT_LANG) {
        loadTranslations(DEFAULT_LANG, callback);
      } else {
        callback(new Error('Translation load failed'), {});
      }
    };
    xhr.send();
  }

  function buildSwitcherCSS() {
    if (document.getElementById('ss-i18n-style')) return;
    var style = document.createElement('style');
    style.id = 'ss-i18n-style';
    // 2026-04-24 fix: language dropdown was getting clipped by parent
    // stacking contexts (sticky nav z:100, currency dropdown next door)
    // and truncated off-screen when the switcher sat near the viewport
    // edge. The bumped z-index + overflow reset + positioning guards
    // below keep it fully visible on every page and every width.
    style.textContent = [
      // Reset overflow on the host chain so nothing upstream clips the
      // absolutely-positioned dropdown.
      '#ss-lang-switcher,#ss-lang-switcher *{overflow:visible!important;}',
      '#ss-lang-switcher{position:relative;display:inline-flex;align-items:center;isolation:auto;}',
      '#ss-lang-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 12px;border-radius:999px;',
        'border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);',
        'color:#f5f5f7;font:700 13px/1 "DM Sans","Inter",sans-serif;cursor:pointer;',
        'transition:border-color 180ms,background 180ms;white-space:nowrap;}',
      '#ss-lang-btn:hover{border-color:rgba(57,255,20,0.35);background:rgba(57,255,20,0.08);}',
      '#ss-lang-btn .ss-flag{font-size:16px;line-height:1;}',
      // Dropdown: high z-index (above every nav + any currency widget),
      // right-aligned to the button but with a max-height + scroll so
      // 8 language options always fit on short viewports without
      // running off the bottom of the screen.
      '#ss-lang-dropdown{display:none;position:absolute;top:calc(100% + 8px);right:0;',
        'min-width:200px;max-height:70vh;overflow-y:auto!important;',
        'background:rgba(10,14,20,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:16px;',
        'padding:8px;z-index:100000;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);',
        'box-shadow:0 16px 40px rgba(0,0,0,0.5);}',
      '#ss-lang-dropdown.open{display:block;}',
      '.ss-lang-opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;',
        'cursor:pointer;font:600 14px/1.3 "DM Sans","Inter",sans-serif;color:#eef3f7;',
        'transition:background 140ms;white-space:nowrap;}',
      '.ss-lang-opt:hover{background:rgba(57,255,20,0.1);}',
      '.ss-lang-opt.ss-active{background:rgba(57,255,20,0.14);color:#39ff14;}',
      '.ss-lang-opt .ss-opt-flag{font-size:18px;}',
      '.ss-lang-opt .ss-opt-code{font-size:12px;color:rgba(255,255,255,0.4);margin-left:auto;}',
      '#ss-lang-switcher{z-index:100000;}',
      // Narrow viewports: dropdown can extend past the right edge of the
      // button; keep it within 8px of the viewport right. Also left-anchor
      // instead of right-anchor so small screens don\'t clip it.
      '@media(max-width:560px){#ss-lang-dropdown{right:auto;left:0;min-width:min(240px,calc(100vw - 24px));max-width:calc(100vw - 24px);}}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildSwitcher(currentLang) {
    buildSwitcherCSS();
    var meta = LANG_META[currentLang] || LANG_META[DEFAULT_LANG];

    var wrapper = document.createElement('div');
    wrapper.id = 'ss-lang-switcher';

    var btn = document.createElement('button');
    btn.id = 'ss-lang-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-label', 'Change language');
    btn.innerHTML = '<span class="ss-flag">' + meta.flag + '</span> ' + meta.label + ' <span aria-hidden="true">▾</span>';

    var dropdown = document.createElement('div');
    dropdown.id = 'ss-lang-dropdown';
    dropdown.setAttribute('role', 'listbox');

    SUPPORTED.forEach(function (lang) {
      var m = LANG_META[lang];
      var opt = document.createElement('div');
      opt.className = 'ss-lang-opt' + (lang === currentLang ? ' ss-active' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', lang === currentLang ? 'true' : 'false');
      opt.setAttribute('data-ss-lang', lang);
      opt.innerHTML = '<span class="ss-opt-flag">' + m.flag + '</span><span>' + m.native + '</span><span class="ss-opt-code">' + m.label + '</span>';
      opt.addEventListener('click', function () {
        window.i18n && window.i18n.setLang(lang);
        dropdown.classList.remove('open');
      });
      dropdown.appendChild(opt);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', function () {
      dropdown.classList.remove('open');
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  function injectSwitcher(currentLang) {
    if (document.getElementById('ss-lang-switcher')) return;
    var switcher = buildSwitcher(currentLang);
    // 1. Preferred: inject into .nav-cta (redesigned pages — index, features, how-it-works)
    var navCta = document.querySelector('.nav-cta');
    if (navCta) {
      navCta.insertBefore(switcher, navCta.firstChild);
      return;
    }
    // 2. Fallback: append to .nav-links (pricing page — links+ctas share one container)
    var navLinks = document.querySelector('.nav-links');
    if (navLinks) {
      navLinks.appendChild(switcher);
      return;
    }
    // 3. Fallback: #mainNav (growth pages — policy, about, for-*, blog, contact)
    var mainNav = document.getElementById('mainNav');
    if (mainNav) {
      mainNav.appendChild(switcher);
      return;
    }
    // 4. Last-resort: fixed position, avoid top-right hamburger conflict
    switcher.style.cssText = 'position:fixed;bottom:74px;right:16px;z-index:998;';
    document.body.appendChild(switcher);
  }

  function refreshSwitcher(lang) {
    var meta = LANG_META[lang] || LANG_META[DEFAULT_LANG];
    var btn = document.getElementById('ss-lang-btn');
    if (btn) btn.innerHTML = '<span class="ss-flag">' + meta.flag + '</span> ' + meta.label + ' <span aria-hidden="true">▾</span>';
    document.querySelectorAll('.ss-lang-opt').forEach(function (o) {
      var active = o.getAttribute('data-ss-lang') === lang;
      o.classList.toggle('ss-active', active);
      o.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    loadTranslations(lang, function (err, t) {
      if (!err || lang === DEFAULT_LANG) {
        document.documentElement.lang = lang;
        applyTranslations(t);
        window.i18n.lang = lang;
        window.i18n.t = t;
        refreshSwitcher(lang);
        document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: lang, t: t } }));
      }
    });
  }

  function init() {
    var lang = detectLang();
    document.documentElement.lang = lang;
    loadTranslations(lang, function (err, t) {
      applyTranslations(t);
      window.i18n = { lang: lang, t: t, setLang: setLang, apply: function () { applyTranslations(t); } };
      injectSwitcher(lang);
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: lang, t: t } }));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
