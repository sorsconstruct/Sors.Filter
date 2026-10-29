/* map3d.js — free 3D map (MapLibre GL + OpenFreeMap vector tiles, no API key).
   The library is loaded lazily when the map comes near the viewport. If it cannot load, a flat OpenStreetMap embed is shown.
   Company address, phone and map settings come from config.js. */
(function (root, $) {
  'use strict';

  var CFG = root.SORS_CONFIG, I = root.SorsI18n;
  var VER = '4.7.1';
  var LIB_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@' + VER + '/dist/maplibre-gl.js';
  var LIB_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@' + VER + '/dist/maplibre-gl.css';
  var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var M = root.SorsMap = {};
  var map = null, loaded = false, started = false, is3d = true, orbit = !reduced, visible = true, pausedUntil = 0;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ───────────── contact details beside the map ───────────── */
  M.renderInfo = function () {
    var c = CFG.company, bg = I.lang === 'bg';
    $('#addrText').html(esc(bg ? c.streetBg : c.streetEn) + '<br>' + esc(bg ? c.cityBg : c.cityEn));
    $('#phoneLink').text(c.phone).attr('href', 'tel:' + String(c.phone).replace(/[^\d+]/g, ''));
    $('#emailLink').text(c.email).attr('href', 'mailto:' + c.email);
    $('#hoursText').text(bg ? c.hoursBg : c.hoursEn);
    $('#gmapsLink').attr('href', 'https://www.google.com/maps/search/?api=1&query=' + c.coords[1] + ',' + c.coords[0]);
  };

  /* ───────────── fallback: flat OpenStreetMap embed ───────────── */
  function fallback() {
    if (map) { try { map.remove(); } catch (e) {} map = null; }
    var c = CFG.company.coords, d = 0.006;
    var src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + [c[0] - d * 1.6, c[1] - d, c[0] + d * 1.6, c[1] + d].join(',') +
      '&layer=mapnik&marker=' + c[1] + ',' + c[0];
    $('#map3d').empty().append($('<iframe>', { src: src, title: 'Map', loading: 'lazy', referrerpolicy: 'no-referrer' }));
    $('.map-tools').prop('hidden', true);
    $('#mapNote').prop('hidden', false);
    loaded = true;
  }

  function loadLib(cb) {
    if (root.maplibregl) { cb(true); return; }
    var done = false;
    function finish(ok) { if (!done) { done = true; cb(ok); } }
    $('<link>', { rel: 'stylesheet', href: LIB_CSS }).appendTo('head');
    var s = document.createElement('script');
    s.src = LIB_JS; s.async = true;
    s.onload = function () { finish(!!root.maplibregl); };
    s.onerror = function () { finish(false); };
    document.head.appendChild(s);
    root.setTimeout(function () { finish(!!root.maplibregl); }, 15000);
  }

  /* ───────────── the map ───────────── */
  function start() {
    var el = document.getElementById('map3d');
    var ml = root.maplibregl;
    try {
      map = new ml.Map({
        container: el, style: CFG.map.style, center: CFG.company.coords, zoom: CFG.map.zoom,
        pitch: CFG.map.pitch, bearing: CFG.map.bearing, maxPitch: 78, antialias: true
      });
    } catch (e) { fallback(); return; }

    map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-left');

    var pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.innerHTML = '<span>Sors HVAC</span><i></i><b></b>';
    new ml.Marker({ element: pin, anchor: 'bottom' }).setLngLat(CFG.company.coords).addTo(map);

    // the flat map is only for a style that never arrives (blocked network, no WebGL);
    // once the style is in, a missing tile or glyph is not fatal and the 3D map stays
    var styleReady = false;
    var timer = root.setTimeout(function () { if (!styleReady && !loaded) fallback(); }, 20000);
    function ready() { styleReady = true; root.clearTimeout(timer); }
    function pad() {
      if (!map || !map.setPadding) return;
      var w = el.clientWidth;
      map.setPadding({ top: 0, bottom: 0, right: 0, left: w >= 576 ? Math.min(360, w * 0.5) : 0 });
    }
    map.on('styledata', ready);
    map.on('load', function () { loaded = true; ready(); pad(); });
    map.on('error', function () { if (!styleReady && !loaded) { root.clearTimeout(timer); fallback(); } });
    map.on('movestart', function (e) { if (e.originalEvent) pausedUntil = performance.now() + 6000; });
    $(root).on('resize', pad);
    pad();

    bindTools();
    if (!reduced) root.requestAnimationFrame(tick);
  }

  var last = 0;
  function tick(now) {
    root.requestAnimationFrame(tick);
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!map || !loaded || !orbit || !is3d || !visible || now < pausedUntil || document.hidden) return;
    map.setBearing(map.getBearing() + dt * 4.5);
  }

  function setMode(on) {
    is3d = on;
    $('#map3dBtn').toggleClass('is-on', on).attr('aria-pressed', on ? 'true' : 'false');
    $('#map2dBtn').toggleClass('is-on', !on).attr('aria-pressed', on ? 'false' : 'true');
    $('#mapOrbit').prop('disabled', !on).css('opacity', on ? 1 : .5);
    if (!map) return;
    map.easeTo({ pitch: on ? CFG.map.pitch : 0, bearing: on ? CFG.map.bearing : 0, duration: reduced ? 0 : 900 });
  }

  function bindTools() {
    $('#map3dBtn').on('click', function () { setMode(true); });
    $('#map2dBtn').on('click', function () { setMode(false); });
    $('#mapOrbit').on('click', function () {
      orbit = !orbit;
      $(this).toggleClass('is-on', orbit).attr('aria-pressed', orbit ? 'true' : 'false');
      pausedUntil = 0;
    }).toggleClass('is-on', orbit).attr('aria-pressed', orbit ? 'true' : 'false');
  }

  function boot() {
    if (started) return;
    started = true;
    loadLib(function (ok) { if (ok) start(); else fallback(); });
  }

  function init() {
    var el = document.getElementById('map3d');
    if (!el) return;
    M.renderInfo();
    $(document).on('sors:lang', M.renderInfo);
    if (!('IntersectionObserver' in root)) { boot(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (e.isIntersecting) boot();
      });
    }, { rootMargin: '600px 0px' });
    io.observe(el);
  }

  $(init);
})(window, window.jQuery);
