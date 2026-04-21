/**
 * SmartSwing AI — Client-side pricing currency auto-detect + display + picker.
 *
 * Paired with api/create-checkout-session.js multi-currency support.
 * When a visitor lands on pricing.html, we:
 *   1. Detect their likely currency from navigator.language + optional
 *      Cloudflare CF-IPCountry cookie (if deployed behind Cloudflare)
 *   2. Replace all [data-plan-price="<planId>"] values with the local-currency
 *      equivalent using PRICING_TABLE
 *   3. Replace [data-plan-interval] with localized "/mo" or "/month"
 *   4. Render a floating currency picker so users can override
 *   5. Store the chosen currency in localStorage so checkout.html picks it up
 *      and passes `currency` to /api/create-checkout-session
 *
 * IMPORTANT: these are DISPLAY-ONLY approximate rates. The actual charge amount
 * comes from Stripe (currency_options on each Price object). Make sure the
 * Stripe Dashboard Prices have currency_options matching these keys so the
 * checkout charge matches what the user saw on pricing.html.
 *
 * Updating rates:
 *   - Quarterly, pull FX from ECB or xe.com and update PRICING_TABLE
 *   - Keep the USD row as the source of truth; all others are derived-display-only
 */
(function () {
  'use strict';

  // Currency list in the allowlist on the server. Keep in sync with
  // api/create-checkout-session.js CURRENCY_ALLOWLIST.
  var SUPPORTED = ['USD', 'BRL', 'MXN', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'INR'];

  // Display prices per plan per currency. Values must match (or closely approximate)
  // what Stripe will actually charge via Price.currency_options on each Price ID.
  // Format: PRICING_TABLE[currency][planId] = { monthly: string, yearly: string }
  var PRICING_TABLE = {
    USD: {
      starter:     { monthly: '$9.99',   yearly: '$99.99',  symbol: '$',   code: 'USD' },
      pro:         { monthly: '$19.99',  yearly: '$199.99', symbol: '$',   code: 'USD' },
      performance: { monthly: '$19.99',  yearly: '$199.99', symbol: '$',   code: 'USD' }
    },
    BRL: {
      starter:     { monthly: 'R$ 49',   yearly: 'R$ 489',  symbol: 'R$',  code: 'BRL' },
      pro:         { monthly: 'R$ 99',   yearly: 'R$ 989',  symbol: 'R$',  code: 'BRL' },
      performance: { monthly: 'R$ 99',   yearly: 'R$ 989',  symbol: 'R$',  code: 'BRL' }
    },
    MXN: {
      starter:     { monthly: '$199',    yearly: '$1,999',  symbol: '$',   code: 'MXN' },
      pro:         { monthly: '$399',    yearly: '$3,999',  symbol: '$',   code: 'MXN' },
      performance: { monthly: '$399',    yearly: '$3,999',  symbol: '$',   code: 'MXN' }
    },
    EUR: {
      starter:     { monthly: '€9',      yearly: '€89',     symbol: '€',   code: 'EUR' },
      pro:         { monthly: '€18',     yearly: '€179',    symbol: '€',   code: 'EUR' },
      performance: { monthly: '€18',     yearly: '€179',    symbol: '€',   code: 'EUR' }
    },
    GBP: {
      starter:     { monthly: '£8',      yearly: '£79',     symbol: '£',   code: 'GBP' },
      pro:         { monthly: '£16',     yearly: '£159',    symbol: '£',   code: 'GBP' },
      performance: { monthly: '£16',     yearly: '£159',    symbol: '£',   code: 'GBP' }
    },
    CAD: {
      starter:     { monthly: 'C$13',    yearly: 'C$129',   symbol: 'C$',  code: 'CAD' },
      pro:         { monthly: 'C$27',    yearly: 'C$269',   symbol: 'C$',  code: 'CAD' },
      performance: { monthly: 'C$27',    yearly: 'C$269',   symbol: 'C$',  code: 'CAD' }
    },
    AUD: {
      starter:     { monthly: 'A$14',    yearly: 'A$139',   symbol: 'A$',  code: 'AUD' },
      pro:         { monthly: 'A$29',    yearly: 'A$289',   symbol: 'A$',  code: 'AUD' },
      performance: { monthly: 'A$29',    yearly: 'A$289',   symbol: 'A$',  code: 'AUD' }
    }
  };

  // Country ISO-2 → preferred currency. Accept-Language + CF-IPCountry feed this.
  var COUNTRY_TO_CURRENCY = {
    BR: 'BRL', MX: 'MXN', AR: 'USD', CO: 'USD', CL: 'USD', PE: 'USD', UY: 'USD',
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR',
    PT: 'EUR', AT: 'EUR', GR: 'EUR', FI: 'EUR',
    GB: 'GBP',
    CA: 'CAD',
    AU: 'AUD', NZ: 'AUD',
    CH: 'CHF',
    JP: 'JPY',
    IN: 'INR'
  };

  function detectDefaultCurrency() {
    // 1. Explicit override via ?currency= query param (for testing)
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var paramCurrency = (urlParams.get('currency') || '').toUpperCase();
      if (SUPPORTED.indexOf(paramCurrency) !== -1) return paramCurrency;
    } catch (_) {}

    // 2. Previously chosen currency in localStorage
    try {
      var saved = localStorage.getItem('ss_currency');
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (_) {}

    // 3. Cloudflare-set cookie (if deployed behind CF)
    try {
      var m = document.cookie.match(/cf-ipcountry=([A-Z]{2})/i);
      if (m && m[1]) {
        var countryCF = m[1].toUpperCase();
        if (COUNTRY_TO_CURRENCY[countryCF]) return COUNTRY_TO_CURRENCY[countryCF];
      }
    } catch (_) {}

    // 4. Browser locale
    try {
      var lang = (navigator.language || navigator.userLanguage || 'en-US').toUpperCase();
      // 'pt-BR' → BR, 'es-MX' → MX, 'en-US' → US, etc.
      var countryLang = lang.split('-')[1] || lang.split('_')[1];
      if (countryLang && COUNTRY_TO_CURRENCY[countryLang]) return COUNTRY_TO_CURRENCY[countryLang];

      // Language-only fallbacks
      if (lang.startsWith('PT')) return 'BRL'; // assume Brazilian PT unless explicit PT-PT
      if (lang.startsWith('ES')) return 'MXN'; // assume LatAm ES unless explicit ES-ES
      if (lang.startsWith('DE') || lang.startsWith('FR') || lang.startsWith('IT') || lang.startsWith('NL')) return 'EUR';
    } catch (_) {}

    return 'USD';
  }

  var CURRENT_CURRENCY = detectDefaultCurrency();

  function applyCurrency(currency) {
    currency = (currency || 'USD').toUpperCase();
    if (!PRICING_TABLE[currency]) currency = 'USD';
    CURRENT_CURRENCY = currency;

    try { localStorage.setItem('ss_currency', currency); } catch (_) {}

    var table = PRICING_TABLE[currency];

    // Replace plan price elements
    document.querySelectorAll('[data-plan-price]').forEach(function (el) {
      var planId = el.getAttribute('data-plan-price');
      var interval = el.getAttribute('data-interval') || 'monthly';
      var entry = table[planId];
      if (!entry) return;
      el.textContent = entry[interval] || entry.monthly;
    });

    // Update JSON-LD currency if present (SEO)
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
      try {
        var data = JSON.parse(script.textContent);
        if (data && Array.isArray(data.offers)) {
          var changed = false;
          data.offers.forEach(function (offer) {
            if (offer && offer.priceCurrency) {
              offer.priceCurrency = currency;
              changed = true;
            }
          });
          if (changed) script.textContent = JSON.stringify(data, null, 2);
        }
      } catch (_) {}
    });

    // Update the picker UI if present
    var picker = document.getElementById('currencyPicker');
    if (picker) picker.value = currency;

    // Notify listeners (checkout.html might want to update too)
    try {
      window.dispatchEvent(new CustomEvent('ss:currency-change', { detail: { currency: currency } }));
    } catch (_) {}
  }

  function renderPicker() {
    if (document.getElementById('currencyPicker')) return; // already present
    var nav = document.querySelector('.top-nav, .top-bar, .nav, nav, header');
    var select = document.createElement('select');
    select.id = 'currencyPicker';
    select.setAttribute('aria-label', 'Choose display currency');
    select.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:999;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(10,10,10,.8);color:#f5f5f7;font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(8px);';
    Object.keys(PRICING_TABLE).forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c + ' ' + (PRICING_TABLE[c].starter.symbol || '');
      if (c === CURRENT_CURRENCY) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () { applyCurrency(select.value); });
    document.body.appendChild(select);
  }

  // Expose for checkout.html + other pages
  window.SmartSwingPricing = {
    getCurrency: function () { return CURRENT_CURRENCY; },
    setCurrency: applyCurrency,
    getCountry: function () {
      // ISO 2-letter country for Stripe payment method selection (Pix for BR, SEPA for DE, etc.)
      try {
        var m = document.cookie.match(/cf-ipcountry=([A-Z]{2})/i);
        if (m && m[1]) return m[1].toUpperCase();
        var lang = (navigator.language || navigator.userLanguage || '');
        var countryLang = lang.split('-')[1] || lang.split('_')[1];
        if (countryLang) return countryLang.toUpperCase();
      } catch (_) {}
      return null;
    },
    PRICING_TABLE: PRICING_TABLE
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyCurrency(CURRENT_CURRENCY); renderPicker(); });
  } else {
    applyCurrency(CURRENT_CURRENCY);
    renderPicker();
  }
})();
