/* order-core.js — the configurator: state, model/size/colour controls, live 3D binding and the price estimate.
   The wizard (steps, validation, payment, API calls) lives in order-flow.js and reads SorsOrder.state. */
(function (root, $) {
  'use strict';

  var C = root.SorsCatalog, I = root.SorsI18n, CFG = root.SORS_CONFIG, F = root.SorsForms, Vd = F.V;
  function t(k, v) { return I.t(k, v); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function copy(o) { return { w: o.w, h: o.h, d: o.d }; }

  var O = root.SorsOrder = { viewer: null, thumbs: {} };
  var NOOP = { setModel: function () {}, setDims: function () {}, setColors: function () {}, setFrameMaterial: function () {}, setPleat: function () {}, setUnit: function () {}, setAirflow: function () {} };
  function vw() { return O.viewer || NOOP; }
  O.vw = vw;

  var state = O.state = {
    modelId: 'panel', shape: 'panel', custom: false,
    dims: { w: 592, h: 592, d: 48 }, ref: { w: 592, h: 592, d: 48 }, sizeIdx: 0,
    cls: 'F7', frameColor: '#B8C1C7', frameId: 'galv', frameTouched: false,
    mediaColor: C.MEDIA_COLOR, mediaId: 'white',
    frameMat: 'steel', pleat: 'standard', qty: 1, unit: 'cm',
    delivery: 'courier', payment: 'card'
  };

  function modelById(id) { for (var i = 0; i < C.MODELS.length; i++) if (C.MODELS[i].id === id) return C.MODELS[i]; return C.MODELS[0]; }
  function curModel() { return modelById(state.modelId); }

  /* ───────────── formatting ───────────── */
  function fmtDim(mm, unit) {
    unit = unit || state.unit;
    return unit === 'mm' ? I.number(Math.round(mm), 0) : I.number(Math.round(mm) / 10, 1);
  }
  function unitText() { return t('unit.' + state.unit); }
  function sizeText(shape, d) {
    var u = unitText();
    if (shape === 'round') return '⌀ ' + fmtDim(d.w) + ' × ' + fmtDim(d.d) + ' ' + u;
    if (shape === 'cartridge') return '⌀ ' + fmtDim(d.w) + ' × ' + fmtDim(d.h) + ' ' + u;
    return fmtDim(d.w) + ' × ' + fmtDim(d.h) + ' × ' + fmtDim(d.d) + ' ' + u;
  }
  O.fmtDim = fmtDim; O.sizeText = sizeText; O.esc = esc;

  /* ───────────── small icons shown until the 3D thumbnails are ready ───────────── */
  var SV = '<svg viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">';
  var ICONS = {
    panel: SV + '<rect x="8" y="6" width="48" height="36" rx="2"/><path d="M14 12v24M20 12v24M26 12v24M32 12v24M38 12v24M44 12v24M50 12v24" stroke-width="1.4" opacity=".7"/></svg>',
    round: SV + '<circle cx="32" cy="24" r="19"/><circle cx="32" cy="24" r="5"/><path d="M32 5v14M32 29v14M13 24h14M37 24h14M18.6 10.6l9.9 9.9M35.5 27.5l9.9 9.9M45.4 10.6l-9.9 9.9M28.5 27.5l-9.9 9.9" stroke-width="1.3" opacity=".7"/></svg>',
    cartridge: SV + '<ellipse cx="32" cy="9" rx="14" ry="4"/><path d="M18 9v30c0 2.2 6.3 4 14 4s14-1.8 14-4V9"/><path d="M24 12v30M32 13v31M40 12v30" stroke-width="1.4" opacity=".7"/></svg>',
    pocket: SV + '<rect x="8" y="6" width="48" height="36" rx="2"/><path d="M8 42l8-30 8 30 8-30 8 30 8-30 8 30" stroke-width="1.5" opacity=".8"/></svg>',
    vbank: SV + '<rect x="8" y="6" width="48" height="36" rx="2"/><path d="M12 10l10 28 10-28 10 28 10-28" stroke-width="1.5" opacity=".8"/></svg>',
    custom: SV + '<rect x="14" y="10" width="34" height="24" rx="2"/><path d="M14 41h34M14 38v6M48 38v6M55 10v24M52 10h6M52 34h6" stroke-width="1.6"/></svg>'
  };

  /* ───────────── accessible radio groups ───────────── */
  function markChecked($root, sel, val) {
    var any = false;
    $root.find(sel).each(function () {
      var on = String($(this).attr('data-v')) === String(val);
      any = any || on;
      $(this).attr({ 'aria-checked': on ? 'true' : 'false', tabindex: on ? 0 : -1 });
    });
    if (!any) $root.find(sel).first().attr('tabindex', 0);
  }
  function radioGroup($root, sel, onPick) {
    $root.on('click', sel, function () { onPick(String($(this).attr('data-v'))); });
    $root.on('keydown', sel, function (e) {
      var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      var $items = $root.find(sel), i = ($items.index(this) + d + $items.length) % $items.length;
      e.preventDefault();
      $items.eq(i).trigger('focus').trigger('click');
    });
  }

  /* ───────────── model cards ───────────── */
  function renderRail() {
    var html = C.MODELS.map(function (m) {
      var thumb = O.thumbs[m.id] ? '<img alt="" width="360" height="270" src="' + O.thumbs[m.id] + '">' : ICONS[m.id];
      return '<button type="button" class="model-card" role="radio" aria-checked="false" data-v="' + m.id + '">' +
        '<span class="model-thumb">' + thumb + '</span>' +
        '<b>' + esc(t('model.' + m.id + '.name')) + '</b><small>' + esc(t('model.' + m.id + '.desc')) + '</small></button>';
    }).join('');
    var $r = $('#modelRail').html(html);
    markChecked($r, '.model-card', state.modelId);
  }

  /* ───────────── sizes ───────────── */
  function dimSpecs() {
    var L = C.SHAPES[state.shape].limits;
    if (state.shape === 'round') return [{ k: 'w', name: 'dim.diameter', lim: L.w }, { k: 'd', name: 'dim.depth', lim: L.d }];
    if (state.shape === 'cartridge') return [{ k: 'w', name: 'dim.diameter', lim: L.w }, { k: 'h', name: 'dim.length', lim: L.h }, { k: 'd', name: 'dim.pleatDepth', lim: L.d }];
    return [{ k: 'w', name: 'dim.width', lim: L.w }, { k: 'h', name: 'dim.height', lim: L.h }, { k: 'd', name: 'dim.depth', lim: L.d }];
  }

  function renderSizes() {
    var m = curModel();
    $('#presetWrap').prop('hidden', state.custom);
    $('#customWrap').prop('hidden', !state.custom);
    if (!state.custom) {
      var chips = m.sizes.map(function (s, i) {
        return '<button type="button" class="chip" role="radio" aria-checked="false" data-v="' + i + '">' + esc(sizeText(m.shape, { w: s[0], h: s[1], d: s[2] })) + '</button>';
      });
      chips.push('<button type="button" class="chip chip-own" role="radio" aria-checked="false" data-v="own">' + esc(t('s1.own')) + '</button>');
      var $p = $('#sizePresets').html(chips.join(''));
      markChecked($p, '.chip', state.sizeIdx);
    } else {
      renderShapeSelect();
      renderDimInputs();
    }
  }

  function renderShapeSelect() {
    var html = Object.keys(C.SHAPES).map(function (s) {
      return '<option value="' + s + '"' + (s === state.shape ? ' selected' : '') + '>' + esc(t('shape.' + s)) + '</option>';
    }).join('');
    $('#shapeSelect').html(html);
  }

  function renderDimInputs() {
    var specs = dimSpecs(), col = specs.length === 3 ? 'col-4' : 'col-6', u = unitText();
    var html = specs.map(function (s) {
      return '<div class="' + col + '"><div class="form-floating dim-field">' +
        '<input type="text" class="form-control" id="dim_' + s.k + '" name="' + s.k + '" data-k="' + s.k + '" inputmode="decimal" autocomplete="off" placeholder=" " value="' + esc(fmtDim(state.dims[s.k])) + '">' +
        '<label for="dim_' + s.k + '">' + esc(t(s.name)) + '</label><span class="dim-unit">' + esc(u) + '</span><div class="invalid-feedback"></div></div></div>';
    }).join('');
    $('#dimInputs').html(html);
    renderDimHelp();
  }

  function renderDimHelp() {
    var u = unitText(), parts = dimSpecs().map(function (s) {
      return t('s1.limits', { name: t(s.name), min: fmtDim(s.lim[0]), max: fmtDim(s.lim[1]) + ' ' + u });
    });
    var d = state.ref, line = t('s1.default', {
      w: fmtDim(d.w), h: state.shape === 'round' ? fmtDim(d.w) : fmtDim(d.h), d: fmtDim(d.d) + ' ' + u
    });
    $('#dimHelp').html(esc(line) + '<br>' + esc(parts.join('; ')));
  }

  /* Reads one input; pushes the value to the 3D model as soon as it is valid. Returns true when valid. */
  function readDim($in) {
    var k = $in.data('k'), spec = null, raw = $.trim($in.val());
    dimSpecs().forEach(function (s) { if (s.k === k) spec = s; });
    if (!spec) return true;
    if (raw === '') { F.setError($in, 'err.required'); return false; }
    var n = Vd.number(raw);
    if (isNaN(n)) { F.setError($in, 'err.number'); return false; }
    var mm = Math.round((state.unit === 'cm' ? n * 10 : n) * 10) / 10, u = unitText();
    if (mm < spec.lim[0] - 1e-6 || mm > spec.lim[1] + 1e-6) {
      F.setError($in, 'err.range', { min: fmtDim(spec.lim[0]) + ' ' + u, max: fmtDim(spec.lim[1]) + ' ' + u });
      return false;
    }
    F.clearError($in);
    state.dims[k] = mm;
    if (state.shape === 'round' && k === 'w') state.dims.h = mm;
    return true;
  }
  O.validateDims = function () {
    var ok = true;
    if (state.custom) $('#dimInputs input').each(function () { if (!readDim($(this))) ok = false; });
    return ok;
  };

  function pushDims() { vw().setDims(state.dims); updatePrice(); }

  /* ───────────── filter class, colours, material, pleats ───────────── */
  function renderClasses() {
    var m = curModel();
    if (m.classes.indexOf(state.cls) < 0) state.cls = m.cls;
    var html = m.classes.map(function (id) {
      var lvl = '';
      for (var i = 1; i <= 5; i++) lvl += '<i' + (i <= C.CLASSES[id].level ? ' class="on"' : '') + '></i>';
      return '<button type="button" class="class-btn" role="radio" aria-checked="false" data-v="' + id + '"><b>' + id + '</b><span class="lvl">' + lvl + '</span><small>' + esc(t('class.' + id)) + '</small></button>';
    }).join('');
    var $r = $('#classRow').html(html);
    markChecked($r, '.class-btn', state.cls);
  }

  function swatchHtml(list, nameKey, curId, curHex, kind) {
    var custom = curId === 'custom';
    var html = list.map(function (c) {
      var nm = t(nameKey + '.' + c.id);
      return '<button type="button" class="swatch" role="radio" aria-checked="false" data-v="' + c.id + '" style="--c:' + c.hex + '" title="' + esc(nm) + '" aria-label="' + esc(nm) + '"></button>';
    }).join('');
    html += '<label class="swatch swatch-picker' + (custom ? ' is-custom' : '') + '" style="--c:' + curHex + '" title="' + esc(t('s2.pick')) + '">' +
      '<input type="color" value="' + curHex + '" data-kind="' + kind + '" aria-label="' + esc(t('s2.pick')) + '"></label>';
    var name = custom ? curHex.toUpperCase() : t(nameKey + '.' + curId);
    return html + '<span class="swatch-name">' + esc(name) + '</span>';
  }

  function renderSwatches() {
    var $f = $('#frameColors').html(swatchHtml(C.COLORS, 'color', state.frameId, state.frameColor, 'frame'));
    markChecked($f, '.swatch[data-v]', state.frameId);
    var $m = $('#mediaColors').html(swatchHtml(C.MEDIA_COLORS, 'media', state.mediaId, state.mediaColor, 'media'));
    markChecked($m, '.swatch[data-v]', state.mediaId);
  }

  function renderChips() {
    var mats = Object.keys(C.FRAME_MATERIALS).map(function (id) {
      return '<button type="button" class="chip" role="radio" aria-checked="false" data-v="' + id + '">' + esc(t('mat.' + id)) + '</button>';
    }).join('');
    markChecked($('#matRow').html(mats), '.chip', state.frameMat);
    var pl = Object.keys(C.PLEATS).map(function (id) {
      return '<button type="button" class="chip" role="radio" aria-checked="false" data-v="' + id + '">' + esc(t('pleat.' + id)) + '</button>';
    }).join('');
    markChecked($('#pleatRow').html(pl), '.chip', state.pleat);
  }

  /* ───────────── applying a model ───────────── */
  function pickModel(id, o) {
    o = o || {};
    var m = modelById(id), keepShape = state.shape;
    state.modelId = m.id;
    state.custom = !!m.custom;
    if (m.custom) {
      state.shape = o.shape || keepShape;
      if (o.keepDims) { state.ref = copy(state.dims); }
      else { var cd = C.SHAPES[state.shape].custom; state.dims = { w: cd[0], h: cd[1], d: cd[2] }; state.ref = copy(state.dims); }
    } else {
      var s = m.sizes[0];
      state.shape = m.shape; state.sizeIdx = 0;
      state.dims = { w: s[0], h: s[1], d: s[2] }; state.ref = copy(state.dims);
    }
    if (m.classes.indexOf(state.cls) < 0) state.cls = m.cls;
    if (!state.frameTouched) {
      var hit = null;
      C.COLORS.forEach(function (c) { if (c.hex.toLowerCase() === m.frame.toLowerCase()) hit = c; });
      state.frameColor = m.frame; state.frameId = hit ? hit.id : 'custom';
    }
    renderRail(); renderSizes(); renderClasses(); renderSwatches();
    vw().setModel(state.shape, state.dims, { ref: state.ref, immediate: !!o.immediate, intro: !!o.intro, delay: o.delay });
    vw().setColors({ frame: state.frameColor, media: state.mediaColor });
    updatePrice();
  }

  function pickPreset(i) {
    var m = curModel(), s = m.sizes[i];
    state.sizeIdx = i;
    state.dims = { w: s[0], h: s[1], d: s[2] }; state.ref = copy(state.dims);
    renderSizes();
    vw().setModel(state.shape, state.dims, { ref: state.ref });
    updatePrice();
  }

  function pickShape(shape) {
    var cd = C.SHAPES[shape].custom;
    state.shape = shape;
    state.dims = { w: cd[0], h: cd[1], d: cd[2] }; state.ref = copy(state.dims);
    renderClasses();
    renderDimInputs();
    vw().setModel(state.shape, state.dims, { ref: state.ref });
    updatePrice();
  }

  /* ───────────── price estimate ───────────── */
  function quote() {
    return C.quote({ shape: state.shape, w: state.dims.w, h: state.dims.h, d: state.dims.d, cls: state.cls, frameMat: state.frameMat, pleat: state.pleat, custom: state.custom },
      state.qty, { delivery: state.delivery, payment: state.payment }, CFG);
  }
  O.quote = quote;

  function tween($el, to) {
    var from = $el.data('v');
    $el.data('v', to);
    if (from == null || from === to || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)) { $el.text(I.money(to, CFG.currency)); return; }
    var t0 = performance.now(), dur = 420;
    function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      $el.text(I.money(from + (to - from) * e, CFG.currency));
      if (k < 1 && $el.data('v') === to) root.requestAnimationFrame(step);
    }
    root.requestAnimationFrame(step);
  }

  function renderSummary(q) {
    var m = curModel(), money = function (v) { return I.money(v, CFG.currency); };
    var line = t('sum.line', { model: t('model.' + (state.custom ? 'custom' : m.id) + '.name') + (state.custom ? ' (' + t('shape.' + state.shape) + ')' : ''), size: sizeText(state.shape, state.dims), cls: state.cls, material: t('mat.' + state.frameMat).toLowerCase() });
    var rows = [
      '<p class="sum-line">' + esc(line) + '</p>',
      row(t('sum.unit'), money(q.unit)),
      row(t('sum.qty'), '× ' + q.qty),
      row(t('sum.subtotal'), money(q.subtotal))
    ];
    if (q.discount > 0) rows.push(row(t('sum.discount', { rate: I.number(q.discountRate * 100, 0) + '%' }), '−' + money(q.discount), 'is-discount'));
    if (state.delivery === 'courier') rows.push(row(t('sum.delivery'), q.delivery === 0 ? t('sum.free') : money(q.delivery)));
    if (q.cod > 0) rows.push(row(t('sum.cod'), money(q.cod)));
    rows.push(row(t('sum.vat', { rate: I.number(q.vatRate * 100, 0) + '%' }), money(q.vat)));
    rows.push('<div class="sum-row sum-total"><span>' + esc(t('sum.total')) + '</span><span>' + esc(money(q.total)) + '</span></div>');
    $('#summary').html(rows.join(''));
    function row(k, v, cls) { return '<div class="sum-row ' + (cls || '') + '"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>'; }
  }
  O.renderSummary = function () { renderSummary(quote()); };

  function updatePrice() {
    var q = quote();
    tween($('#stageTotal'), q.total);
    $('#btnAmount').text(I.money(q.total, CFG.currency));
    renderSummary(q);
    $(document).trigger('sors:price', [q]);
  }
  O.updatePrice = updatePrice;

  /* ───────────── thumbnails rendered once with the same viewer ───────────── */
  function makeThumbs() {
    var holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:360px;height:270px;pointer-events:none';
    document.body.appendChild(holder);
    var v = new root.SorsViewer(holder, { mode: 'thumb', manual: true, airflow: false, particles: 0 });
    if (!v.failed) {
      C.MODELS.forEach(function (m) {
        var s = m.sizes ? m.sizes[0] : C.SHAPES[m.shape].custom;
        try { O.thumbs[m.id] = v.snapshot(m.shape, { w: s[0], h: s[1], d: s[2] }, { colors: { frame: m.frame }, width: 360, height: 270 }); } catch (e) {}
      });
      var ext = null;
      try { ext = v.gl.getExtension('WEBGL_lose_context'); } catch (e) {}
      v.destroy();
      if (ext) ext.loseContext();
    }
    document.body.removeChild(holder);
    renderRail();
  }

  /* ───────────── init and events ───────────── */
  function renderAll() {
    renderRail(); renderSizes(); renderClasses(); renderSwatches(); renderChips();
    $('#qtyInput').val(state.qty);
    updatePrice();
  }
  O.renderAll = renderAll;

  function setQty(n) {
    n = Math.max(1, Math.min(CFG.maxQty || 500, Math.round(n) || 1));
    state.qty = n;
    $('#qtyInput').val(n);
    updatePrice();
  }

  function init() {
    if (!$('#orderViewer').length) return;

    var el = document.getElementById('orderViewer');
    var v = new root.SorsViewer(el, { mode: 'order', particles: 360, airflow: $('#flowToggle').is(':checked'), unit: state.unit });
    if (v.failed) { $(el).addClass('no-webgl'); $('#stageFallback').prop('hidden', false); }
    else {
      O.viewer = v;
      var legendOn = false;
      v.onInteract = function () { $('#stageHint').addClass('is-hidden'); };
      v.onframe = function (vv) {
        var on = vv.ghostA > 0.05;
        if (on !== legendOn) { legendOn = on; $('#stageLegend').toggleClass('is-on', on); }
      };
    }

    renderChips();
    radioGroup($('#modelRail'), '.model-card', function (id) { if (id !== state.modelId) pickModel(id); });
    radioGroup($('#sizePresets'), '.chip', function (val) {
      if (val === 'own') { pickModel('custom', { keepDims: true, shape: state.shape }); return; }
      pickPreset(parseInt(val, 10));
    });
    radioGroup($('#classRow'), '.class-btn', function (id) { state.cls = id; markChecked($('#classRow'), '.class-btn', id); updatePrice(); });
    radioGroup($('#matRow'), '.chip', function (id) {
      state.frameMat = id; markChecked($('#matRow'), '.chip', id); vw().setFrameMaterial(id); updatePrice();
    });
    radioGroup($('#pleatRow'), '.chip', function (id) {
      state.pleat = id; markChecked($('#pleatRow'), '.chip', id); vw().setPleat(C.PLEATS[id]); updatePrice();
    });

    // colours: swatches and the free colour picker repaint the 3D filter immediately
    function setColor(kind, id, hex) {
      if (kind === 'frame') { state.frameId = id; state.frameColor = hex; state.frameTouched = true; vw().setColors({ frame: hex }); }
      else { state.mediaId = id; state.mediaColor = hex; vw().setColors({ media: hex }); }
      renderSwatches();
    }
    radioGroup($('#frameColors'), '.swatch[data-v]', function (id) {
      C.COLORS.forEach(function (c) { if (c.id === id) setColor('frame', id, c.hex); });
    });
    radioGroup($('#mediaColors'), '.swatch[data-v]', function (id) {
      C.MEDIA_COLORS.forEach(function (c) { if (c.id === id) setColor('media', id, c.hex); });
    });
    $('#frameColors, #mediaColors').on('input', 'input[type=color]', function () {
      var kind = $(this).data('kind'), hex = this.value;
      if (kind === 'frame') { state.frameId = 'custom'; state.frameColor = hex; state.frameTouched = true; vw().setColors({ frame: hex }); }
      else { state.mediaId = 'custom'; state.mediaColor = hex; vw().setColors({ media: hex }); }
      var $row = $(this).closest('.swatch-row');
      $row.find('.swatch[data-v]').attr({ 'aria-checked': 'false', tabindex: -1 });
      $(this).parent().addClass('is-custom').css('--c', hex);
      $row.find('.swatch-name').text(hex.toUpperCase());
    });

    // custom size inputs: every valid keystroke re-renders the filter
    $('#dimInputs').on('input', 'input', function () { if (readDim($(this))) pushDims(); });
    $('#dimInputs').on('blur', 'input', function () { if (readDim($(this))) { $(this).val(fmtDim(state.dims[$(this).data('k')])); pushDims(); } });
    $('#shapeSelect').on('change', function () { pickShape(this.value); });

    // quantity
    $('#qtyMinus').on('click', function () { setQty(state.qty - 1); });
    $('#qtyPlus').on('click', function () { setQty(state.qty + 1); });
    $('#qtyInput').on('input', function () {
      var n = parseInt(String(this.value).replace(/\D/g, ''), 10);
      if (!isNaN(n)) { state.qty = Math.max(1, Math.min(CFG.maxQty || 500, n)); updatePrice(); }
    }).on('blur', function () { setQty(state.qty); });

    // unit and airflow
    $('input[name=unit]').on('change', function () {
      state.unit = this.value;
      vw().setUnit(state.unit);
      renderSizes();
      updatePrice();
    });
    $('#flowToggle').on('change', function () { vw().setAirflow(this.checked); });

    $(document).on('sors:lang', function () { renderAll(); });

    pickModel('panel', { immediate: true, intro: true, delay: 0.2 });
    renderAll();
    root.setTimeout(makeThumbs, 60);
  }

  O.pickModel = pickModel;
  $(init);
})(window, window.jQuery);
