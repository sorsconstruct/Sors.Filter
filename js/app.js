/* app.js — page behaviour: language switch, sticky nav, scroll reveals, the hero 3D filter, the process line. */
(function (root, $) {
  'use strict';

  var I = root.SorsI18n;
  var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ───────────── language ───────────── */
  function syncLangButtons() {
    $('.lang-btn').each(function () {
      var on = $(this).data('lang') === I.lang;
      $(this).toggleClass('is-on', on).attr('aria-pressed', on ? 'true' : 'false');
    });
    $('#year').text('© ' + new Date().getFullYear());
  }

  function initLang() {
    syncLangButtons();
    $('.lang-btn').on('click', function () { I.set($(this).data('lang')); });
    $(document).on('sors:lang', syncLangButtons);
  }

  /* ───────────── navigation ───────────── */
  function initNav() {
    var $nav = $('.site-nav');
    function onScroll() { $nav.toggleClass('is-stuck', (root.scrollY || 0) > 12); }
    onScroll();
    $(root).on('scroll', onScroll);

    $('#navMenu .nav-link, #navMenu .nav-cta').on('click', function () {
      var el = document.getElementById('navMenu');
      var inst = root.bootstrap && root.bootstrap.Collapse && root.bootstrap.Collapse.getInstance(el);
      if (inst && $(el).hasClass('show')) inst.hide();
    });

    if (!('IntersectionObserver' in root)) return;
    var map = { about: 'about', process: 'process', order: 'order', contact: 'contact' };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        $('.nav-link').removeClass('is-active');
        $('.nav-link[href="#' + e.target.id + '"]').addClass('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* ───────────── reveals ───────────── */
  function initReveal() {
    var $els = $('.reveal, .pleat-top');
    if (!('IntersectionObserver' in root) || reduced) { $els.addClass('is-in'); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    $els.each(function () { io.observe(this); });
  }

  /* ───────────── hero 3D filter ───────────── */
  function initHero() {
    var el = document.getElementById('heroStage');
    if (!el || !root.SorsViewer) return;
    var small = root.innerWidth < 768, narrow = root.innerWidth < 992;   // narrow: the filter has its own area under the text
    var v = new root.SorsViewer(el, {
      mode: 'hero', particles: small ? 380 : 760, airflow: true, yaw: -0.52, pitch: 0.16, distance: narrow ? 1.2 : 1.5, flowLen: 760,
      shiftFn: function (w) { return w >= 992 ? 0.44 : 0; }
    });
    if (v.failed) return;
    v.setModel('panel', { w: 592, h: 592, d: 96 }, { immediate: true, intro: true, delay: 0.5 });

    // callouts pinned to parts of the filter
    var calls = {
      media: function (info, cur) { return [-cur.w * 0.2, cur.h * 0.14, cur.d / 2]; },
      frame: function (info, cur) { return [cur.w / 2 - 8, cur.h / 2 - 8, cur.d / 2]; },
      air: function (info, cur) { return [cur.w * 0.3, -cur.h * 0.22, cur.d / 2 + 300]; }
    };
    $('.hero-call').each(function () { var fn = calls[$(this).data('call')]; if (fn) v.track(this, fn); });

    var $hero = $('#home'), ticking = false;
    $hero.on('mousemove', function (e) {
      var r = this.getBoundingClientRect();
      v.setPointer((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
    }).on('mouseleave', function () { v.setPointer(0, 0); });

    function onScroll() {
      ticking = false;
      var h = $hero.outerHeight() || 1, p = clamp((root.scrollY || 0) / h, 0, 1);
      v.setScroll(p);
      el.style.opacity = String(1 - p * 0.75);
    }
    $(root).on('scroll', function () { if (!ticking) { ticking = true; root.requestAnimationFrame(onScroll); } });
    onScroll();
  }

  /* ───────────── process: the pleat line draws itself while you scroll ───────────── */
  function initProcess() {
    var $track = $('#processTrack'), svg = document.getElementById('processLine'), fill = document.getElementById('processFill');
    if (!$track.length || !svg) return;
    var base = svg.querySelector('.pl-base'), $steps = $track.find('.p-step'), n = $steps.length;

    function layout() {
      var W = $track.width(), top = 25, bot = 59, d = '';
      svg.setAttribute('viewBox', '0 0 ' + W + ' 76');
      for (var i = 0; i < n; i++) {
        var px = W * i / n + 18, vx = i < n - 1 ? W * (i + 0.5) / n + 9 : W - 4;
        d += (i ? ' L' : 'M') + px.toFixed(1) + ' ' + top + ' L' + vx.toFixed(1) + ' ' + bot;
      }
      base.setAttribute('d', d);
      fill.setAttribute('d', d);
    }

    function update() {
      var narrow = root.innerWidth < 900, p;
      if (narrow || reduced) p = 1;
      else {
        var r = $track[0].getBoundingClientRect();
        p = clamp((root.innerHeight * 0.8 - r.top) / (root.innerHeight * 0.55), 0, 1);
      }
      fill.style.strokeDashoffset = String(1 - p);
      $steps.each(function (i) { $(this).toggleClass('is-lit', p >= (i + 0.35) / n); });
    }

    var ticking = false;
    function onScroll() { if (!ticking) { ticking = true; root.requestAnimationFrame(function () { ticking = false; update(); }); } }
    layout(); update();
    $(root).on('scroll', onScroll).on('resize', function () { layout(); update(); });
  }

  $(function () {
    initLang();
    initNav();
    initReveal();
    initHero();
    initProcess();
  });
})(window, window.jQuery);
