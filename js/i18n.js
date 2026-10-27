/* i18n.js — tiny EN/BG translation layer.
   Static text: data-i18n="key" (textContent), data-i18n-html (innerHTML), data-i18n-placeholder,
   data-i18n-aria (aria-label), data-i18n-title, data-i18n-content. Dictionaries live in lang-en.js / lang-bg.js. */
(function (root) {
  'use strict';
  var dict = { en: {}, bg: {} };
  var lang = 'en';
  var KEY = 'sors.lang';

  function add(l, entries) {
    dict[l] = dict[l] || {};
    for (var k in entries) if (Object.prototype.hasOwnProperty.call(entries, k)) dict[l][k] = entries[k];
  }

  function t(key, vars) {
    var s = dict[lang][key];
    if (s == null) s = dict.en[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, n) { return vars[n] != null ? vars[n] : m; });
    return s;
  }

  function apply(scope) {
    var $ = root.jQuery;
    var el = scope || document;
    var map = [
      ['[data-i18n]', 'data-i18n', function (n, v) { n.textContent = v; }],
      ['[data-i18n-html]', 'data-i18n-html', function (n, v) { n.innerHTML = v; }],
      ['[data-i18n-placeholder]', 'data-i18n-placeholder', function (n, v) { n.setAttribute('placeholder', v); }],
      ['[data-i18n-aria]', 'data-i18n-aria', function (n, v) { n.setAttribute('aria-label', v); }],
      ['[data-i18n-title]', 'data-i18n-title', function (n, v) { n.setAttribute('title', v); }],
      ['[data-i18n-content]', 'data-i18n-content', function (n, v) { n.setAttribute('content', v); }]
    ];
    map.forEach(function (m) {
      var list = el.querySelectorAll(m[0]);
      for (var i = 0; i < list.length; i++) m[2](list[i], t(list[i].getAttribute(m[1])));
    });
    if (el === document) document.title = t('meta.title');
    return $ ? $(el) : null;
  }

  function detect() {
    var q = /[?&]lang=(en|bg)\b/.exec(location.search);
    if (q) return q[1];
    try { var s = localStorage.getItem(KEY); if (s === 'en' || s === 'bg') return s; } catch (e) {}
    var nav = (navigator.language || 'en').toLowerCase();
    return nav.indexOf('bg') === 0 ? 'bg' : 'en';
  }

  function set(l, silent) {
    if (l !== 'en' && l !== 'bg') l = 'en';
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.setAttribute('lang', l);
    apply(document);
    if (!silent && root.jQuery) root.jQuery(document).trigger('sors:lang', [l]);
  }

  function money(v, currency) {
    try {
      return new Intl.NumberFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', { style: 'currency', currency: currency || 'EUR' }).format(v);
    } catch (e) { return (currency || 'EUR') + ' ' + v.toFixed(2); }
  }

  function number(v, digits) {
    try {
      return new Intl.NumberFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', { maximumFractionDigits: digits == null ? 1 : digits }).format(v);
    } catch (e) { return String(v); }
  }

  root.SorsI18n = {
    add: add, t: t, apply: apply, set: set, detect: detect, money: money, number: number,
    get lang() { return lang; },
    has: function (l, k) { return dict[l] && dict[l][k] != null; },
    keys: function (l) { return Object.keys(dict[l] || {}); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SorsI18n;
})(typeof window !== 'undefined' ? window : globalThis);
