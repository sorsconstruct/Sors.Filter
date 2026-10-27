/* viewer-ui.js — everything around the canvas: dimension lines + labels, tracked callouts, drag-to-rotate, thumbnails. */
(function (root) {
  'use strict';

  var V = root.SorsViewer, GL = root.SorsGL, M4 = GL.M4;
  if (!V) return;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ───────────── overlay with the three dimension labels ───────────── */

  V.prototype._initOverlay = function () {
    var self = this, o = document.createElement('div');
    o.className = 'sv-overlay';
    o.setAttribute('aria-hidden', 'true');
    this.el.appendChild(o);
    this.overlay = o;
    this.labels = {};
    ['w', 'h', 'd'].forEach(function (k) {
      var s = document.createElement('span');
      s.className = 'sv-dim';
      s.setAttribute('data-k', k);
      s.style.opacity = 0;
      o.appendChild(s);
      self.labels[k] = { el: s, text: '', vis: false };
    });
    this._flash = function (k) {
      var l = self.labels[k];
      if (!l) return;
      l.el.classList.remove('is-changed');
      void l.el.offsetWidth;
      l.el.classList.add('is-changed');
    };
  };

  V.prototype._fmt = function (v) {
    var I = root.SorsI18n;
    var u = I ? I.t('unit.' + this.unit) : this.unit;
    if (this.unit === 'mm') return (I ? I.number(Math.round(v), 0) : String(Math.round(v))) + ' ' + u;
    var cm = Math.round(v) / 10;
    return (I ? I.number(cm, 1) : cm.toFixed(1)) + ' ' + u;
  };

  /* Dimension lines: main line + end ticks + extension lines, in object space. */
  V.prototype._buildDims = function () {
    if (this.failed || !this.info || !this.gl) return;
    var A = this.info.anchors, out = [], tk = 0.025 * Math.max(this.cur.w, this.cur.h, this.cur.d) + 4;
    function seg(p, q) { out.push(p[0], p[1], p[2], q[0], q[1], q[2]); }
    ['w', 'h', 'd'].forEach(function (k) {
      var a = A[k];
      if (!a) return;
      var t = a.axis === 'x' ? [0, tk, 0] : [tk, 0, 0];
      seg(a.a, a.b);
      seg([a.a[0] - t[0], a.a[1] - t[1], a.a[2] - t[2]], [a.a[0] + t[0], a.a[1] + t[1], a.a[2] + t[2]]);
      seg([a.b[0] - t[0], a.b[1] - t[1], a.b[2] - t[2]], [a.b[0] + t[0], a.b[1] + t[1], a.b[2] + t[2]]);
      if (a.ea) seg(a.ea, a.a);
      if (a.eb) seg(a.eb, a.b);
    });
    var n = Math.min(out.length / 3, 128);
    this.dimArr.set(out.slice(0, n * 3));
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dimVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dimArr.subarray(0, n * 3));
    this.dimCount = n;
  };

  function project(mvp, p, w, h) {
    var c = M4.apply(mvp, p[0], p[1], p[2]);
    if (c[3] <= 0.01) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * w, (1 - (c[1] / c[3] * 0.5 + 0.5)) * h];
  }

  /* Callouts pinned to a point of the model (used in the hero). fn(info, cur) → [x, y, z] in millimetres. */
  V.prototype.track = function (el, fn) { this.tracked.push({ el: el, fn: fn, vis: false }); };

  V.prototype._updateOverlay = function (mvp) {
    if (!this.overlay) return;
    var A = this.info && this.info.anchors;
    var ready = Math.min(this.appear, this.fold);
    var show = this.labelsOn && A && ready > 0.6;
    var op = show ? Math.min(1, (ready - 0.6) / 0.4) : 0;
    var keys = ['w', 'h', 'd'], i, k, L, a, mid, p, text;
    for (i = 0; i < 3; i++) {
      k = keys[i]; L = this.labels[k]; a = A && A[k];
      if (!a || !show) { if (L.vis) { L.el.style.opacity = 0; L.vis = false; } continue; }
      mid = [(a.a[0] + a.b[0]) / 2, (a.a[1] + a.b[1]) / 2, (a.a[2] + a.b[2]) / 2];
      p = project(mvp, mid, this.cssW, this.cssH);
      if (!p) { if (L.vis) { L.el.style.opacity = 0; L.vis = false; } continue; }
      text = (a.prefix || '') + this._fmt(this.cur[k]);
      if (text !== L.text) { L.el.textContent = text; L.text = text; L.w = L.el.offsetWidth || 60; L.h = L.el.offsetHeight || 24; }
      // keep every label inside the stage, even when its dimension line leaves the picture
      var hw = (L.w || 60) / 2 + 6, hh = (L.h || 24) / 2 + 6;
      p[0] = Math.max(hw, Math.min(this.cssW - hw, p[0]));
      p[1] = Math.max(hh, Math.min(this.cssH - hh, p[1]));
      L.el.style.transform = 'translate(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px) translate(-50%,-50%)';
      L.el.style.opacity = op;
      L.vis = true;
    }
    for (i = 0; i < this.tracked.length; i++) {
      var T = this.tracked[i], pt = this.info ? T.fn(this.info, this.cur) : null;
      p = pt && ready > 0.9 ? project(mvp, pt, this.cssW, this.cssH) : null;
      if (!p) { if (T.vis) { T.el.style.opacity = 0; T.vis = false; } continue; }
      T.el.style.transform = 'translate(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px)';
      T.el.style.opacity = 1;
      T.vis = true;
    }
  };

  /* ───────────── drag to rotate (order viewer) ───────────── */

  V.prototype._bindPointer = function () {
    if (this.mode !== 'order') return;
    var self = this, cv = this.canvas, sx = 0, sy = 0, id = null;
    function down(e) {
      if (e.button != null && e.button !== 0) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY;
      self.dragging = true; self.idle = 0;
      try { cv.setPointerCapture(id); } catch (x) {}
      cv.classList.add('is-drag');
      self._kick();
      if (self.onInteract) self.onInteract();
    }
    function move(e) {
      if (!self.dragging || e.pointerId !== id) return;
      self.yawBase += (e.clientX - sx) * 0.009;
      self.pitchBase = clamp(self.pitchBase + (e.clientY - sy) * 0.006, -0.35, 0.85);
      sx = e.clientX; sy = e.clientY; self.idle = 0;
    }
    function up(e) {
      if (e.pointerId !== id) return;
      self.dragging = false; id = null; self.idle = 0;
      cv.classList.remove('is-drag');
      try { cv.releasePointerCapture(e.pointerId); } catch (x) {}
    }
    function reset() { self.yawBase = self.yaw0; self.pitchBase = self.pitch0; self.idle = 0; }
    function key(e) {
      var d = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
      if (e.key === 'Home' || e.key === 'Escape') { reset(); e.preventDefault(); return; }
      if (!d) return;
      self.yawBase += d[0]; self.pitchBase = clamp(self.pitchBase + d[1], -0.35, 0.85); self.idle = 0;
      e.preventDefault();
    }
    cv.tabIndex = 0;
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', reset);
    cv.addEventListener('keydown', key);
    this._unbind = function () {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('dblclick', reset);
      cv.removeEventListener('keydown', key);
    };
  };

  /* ───────────── one-shot render to a PNG data URL (model thumbnails) ───────────── */

  V.prototype.snapshot = function (shape, dims, o) {
    if (this.failed || this.lost) return null;
    o = o || {};
    var w = o.width || 360, h = o.height || 270;
    this.cssW = w; this.cssH = h; this.dpr = 1;
    this.canvas.width = w; this.canvas.height = h;
    this.reduced = true;
    this._applyModel(shape, dims, dims);
    this.fold = 1; this.appear = 1; this.spin = 0; this.tr = null; this.bob = 0;
    if (o.colors) {
      if (o.colors.frame) { this.colors.frame = GL.hexToLin(o.colors.frame); this.colorsT.frame = this.colors.frame.slice(); }
      if (o.colors.media) { this.colors.media = GL.hexToLin(o.colors.media); this.colorsT.media = this.colors.media.slice(); }
    }
    this.yaw = this.yawBase = o.yaw != null ? o.yaw : -0.62;
    this.pitch = this.pitchBase = o.pitch != null ? o.pitch : 0.2;
    this.dist = this._fitDist(dims, dims) * (o.zoom || 1.15);
    this._render();
    return this.canvas.toDataURL('image/png');
  };
})(typeof window !== 'undefined' ? window : globalThis);
