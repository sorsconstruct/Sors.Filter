/* viewer.js — the live 3D filter preview (plain WebGL, no libraries).
   new SorsViewer(container, { mode: 'order' | 'hero', ... })
   Public: setModel, setDims, setColors, setFrameMaterial, setPleat, setUnit, setAirflow, setScroll, setPointer, track, destroy */
(function (root) {
  'use strict';

  var Geo = root.SorsGeo, Flow = root.SorsFlow, GL = root.SorsGL, M4 = GL.M4, Cat = root.SorsCatalog;
  var FOV = 30 * Math.PI / 180;
  var WORLD = 0.01;            // 1 mm = 0.01 world units
  var TILT = 0.15;             // camera looks slightly down on the object

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function expk(dt, k) { return 1 - Math.exp(-dt * k); }
  function easeInCubic(t) { return t * t * t; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeOutBack(t) { var c1 = 1.5, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function radiusFor(shape, w, h, d) {
    if (shape === 'round') return Math.sqrt(w * w / 4 + d * d / 4);
    if (shape === 'cartridge') return Math.sqrt(Math.pow(w / 2 + 3, 2) + Math.pow(h / 2 + 14, 2));
    return Math.sqrt(w * w + h * h + d * d) / 2;
  }
  /* Radius the camera must keep in view: the bounding sphere, or (with labels) the dimension lines plus a margin. */
  function viewRadius(shape, w, h, d, labels) {
    var s = radiusFor(shape, w, h, d);
    if (!labels) return s;
    var off = 0.08 * Math.max(w, h) + 22;
    return Math.max(s, (halfHeightFor(shape, w, h) + off) * 1.18);
  }
  function halfHeightFor(shape, w, h) {
    if (shape === 'round') return w / 2;
    if (shape === 'cartridge') return h / 2 + 14;
    return h / 2;
  }

  function Viewer(container, opts) {
    opts = opts || {};
    this.el = container;
    this.opts = opts;
    this.mode = opts.mode || 'order';
    this.shape = null;
    this.cur = { w: 400, h: 400, d: 100, pitch: 10 };
    this.tgt = { w: 400, h: 400, d: 100, pitch: 10 };
    this.ref = { w: 400, h: 400, d: 100 };
    this.fold = 1; this.appear = 1; this.spin = 0; this.tr = null;
    this.colors = { frame: GL.hexToLin('#B8C1C7'), media: GL.hexToLin(Cat.MEDIA_COLOR) };
    this.colorsT = { frame: this.colors.frame.slice(), media: this.colors.media.slice() };
    this.surf = { metal: 0.85, rough: 0.38 };
    this.surfT = { metal: 0.85, rough: 0.38 };
    this.unit = opts.unit || 'cm';
    this.airflow = opts.airflow !== false;
    this.flowIntensity = this.airflow ? 1 : 0;
    this.yawBase = opts.yaw != null ? opts.yaw : -0.62;
    this.pitchBase = opts.pitch != null ? opts.pitch : 0.2;
    this.yaw0 = this.yawBase; this.pitch0 = this.pitchBase;
    this.yaw = this.yawBase; this.pitch = this.pitchBase;
    this.idle = 10; this.dragging = false;
    this.time = 0; this.visible = true; this.running = false; this.lost = false;
    this.shiftNdc = opts.shift || 0;
    this.ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    this.scroll = 0;
    this.dist = 20;
    this.bob = 0;
    this.labelsOn = this.mode === 'order' && opts.dimensions !== false;
    this.ghostOn = this.mode === 'order' && opts.ghost !== false;
    this.ghostA = 0;
    this.shadowOn = opts.shadow !== false && this.mode === 'order';
    this.tracked = [];
    this.reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.meshBuf = new Geo.MeshBuf(40000);
    this.nParticles = opts.particles != null ? opts.particles : (this.mode === 'hero' ? 700 : 380);
    this.flow = null;
    this.onframe = null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sv-canvas';
    this.canvas.setAttribute('role', 'img');
    this.el.appendChild(this.canvas);

    this.failed = !this._initGL();
    if (this.failed) {
      this.canvas.parentNode.removeChild(this.canvas);
      this.el.classList.add('no-webgl');
      return;
    }
    var self = this;
    this.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', function () {
      if (self._initGL()) { self.lost = false; self._rebuild(); self._buildGhost(); self._buildDims(); self._configureFlow(true); }
    });
    this._initOverlay();
    if (!opts.manual) {
      this._bindPointer();
      this._observe();
      this._resize();
      this._start();
    }
  }

  /* ───────────────────────── GL setup ───────────────────────── */

  Viewer.prototype._initGL = function () {
    var gl = null;
    try {
      gl = this.canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }) ||
           this.canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) return false;
    this.gl = gl;
    var S = GL.SRC;
    try {
      this.pMesh = GL.program(gl, S.MESH_VS, S.MESH_FS, ['aPos', 'aNor', 'aAo', 'aMat'],
        ['uMVP', 'uModel', 'uCam', 'uCol0', 'uCol1', 'uCol2', 'uCol3', 'uSurf0', 'uSurf1', 'uSurf2', 'uSurf3']);
      this.pLine = GL.program(gl, S.LINE_VS, S.LINE_FS, ['aPos'], ['uMVP', 'uColor']);
      this.pPt = GL.program(gl, S.PT_VS, S.PT_FS, ['aPos', 'aCol', 'aSize'], ['uMVP', 'uScale']);
      this.pBlob = GL.program(gl, S.BLOB_VS, S.BLOB_FS, ['aUv'], ['uMVP', 'uCenter', 'uRadius', 'uAlpha', 'uTint']);
    } catch (e) {
      if (root.console) console.error(e);
      return false;
    }
    function mk(bytes) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
      return b;
    }
    var cap = this.meshBuf.cap;
    this.vbo = { pos: mk(cap * 12), nor: mk(cap * 12), ao: mk(cap * 4), mat: mk(cap * 4) };
    this.ghostVbo = mk(8000 * 12);
    this.dimVbo = mk(128 * 12);
    this.dimArr = new Float32Array(128 * 3);
    this.dimCount = 0;
    this.ghostCount = 0;
    var N = this.nParticles;
    if (!this.flow) this.flow = new Flow.Flow(N);
    this.ptVbo = { pos: mk(N * 12), col: mk(N * 16), size: mk(N * 4) };
    this.blobVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.blobVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    return true;
  };

  Viewer.prototype._resize = function () {
    if (this.failed) return;
    var r = this.el.getBoundingClientRect();
    var w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    var dpr = Math.min(root.devicePixelRatio || 1, this.mode === 'hero' ? 1.75 : 2);
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.opts.shiftFn) this.shiftNdc = this.opts.shiftFn(w, h);
    this._labelsDirty = true;
  };

  Viewer.prototype._observe = function () {
    var self = this;
    if (root.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(this.el);
    } else {
      this._onWin = function () { self._resize(); };
      root.addEventListener('resize', this._onWin);
    }
    if (root.IntersectionObserver) {
      this._io = new IntersectionObserver(function (es) {
        self.visible = es[es.length - 1].isIntersecting;
        if (self.visible) self._start();
      }, { rootMargin: '80px' });
      this._io.observe(this.el);
    }
    this._onVis = function () { if (!document.hidden) self._start(); };
    document.addEventListener('visibilitychange', this._onVis);
  };

  /* ───────────────────────── model state ───────────────────────── */

  Viewer.prototype.setModel = function (shape, dims, o) {
    if (this.failed) return;
    o = o || {};
    var ref = o.ref || dims;
    if (!this.shape || o.immediate || this.reduced) {
      this._applyModel(shape, dims, ref);
      this.tr = null; this.appear = 1; this.fold = 1; this.spin = 0;
      if (o.intro && !this.reduced) { this.appear = 0; this.fold = 0; this.tr = { phase: 'in', t: -(o.delay || 0) }; }
      this._rebuild();
      return;
    }
    if (shape === this.shape) {
      this.ref = { w: ref.w, h: ref.h, d: ref.d };
      this._buildGhost();
      this.setDims(dims);
      return;
    }
    this.tr = { phase: 'out', t: 0, next: { shape: shape, dims: dims, ref: ref } };
  };

  Viewer.prototype._applyModel = function (shape, dims, ref) {
    this.shape = shape;
    this.cur.w = this.tgt.w = dims.w; this.cur.h = this.tgt.h = dims.h; this.cur.d = this.tgt.d = dims.d;
    this.ref = { w: ref.w, h: ref.h, d: ref.d };
    this.dist = this._fitDist(this.ref, this.cur);
    this._buildGhost();
    this._rebuild();
    this._configureFlow(true);
    this._labelsDirty = true;
    this.canvas.setAttribute('aria-label', this.opts.label || '3D filter preview');
  };

  Viewer.prototype.setDims = function (d) {
    var keys = ['w', 'h', 'd'];
    for (var i = 0; i < 3; i++) {
      var k = keys[i];
      if (d[k] != null && isFinite(d[k]) && Math.abs(d[k] - this.tgt[k]) > 1e-6) {
        this.tgt[k] = d[k];
        if (this._flash) this._flash(k);
      }
    }
    this._kick();
  };

  Viewer.prototype.setPleat = function (pitch) { this.tgt.pitch = pitch; this._kick(); };

  Viewer.prototype.setColors = function (c) {
    if (c.frame) this.colorsT.frame = GL.hexToLin(c.frame);
    if (c.media) this.colorsT.media = GL.hexToLin(c.media);
    this._kick();
  };

  Viewer.prototype.setFrameMaterial = function (name) {
    var m = Cat.FRAME_MATERIALS[name] || Cat.FRAME_MATERIALS.steel;
    this.surfT.metal = m.metal; this.surfT.rough = m.rough;
    this._kick();
  };

  Viewer.prototype.setUnit = function (u) { this.unit = u === 'mm' ? 'mm' : 'cm'; this._labelsDirty = true; this._kick(); };
  Viewer.prototype.setAirflow = function (on) { this.airflow = !!on; this._kick(); };
  Viewer.prototype.setScroll = function (p) { this.scroll = clamp(p, 0, 1); };
  Viewer.prototype.setPointer = function (x, y) { this.ptr.tx = clamp(x, -1, 1); this.ptr.ty = clamp(y, -1, 1); };
  Viewer.prototype.setLabel = function (text) { if (this.canvas) this.canvas.setAttribute('aria-label', text); };

  Viewer.prototype.getState = function () {
    return { shape: this.shape, cur: this.cur, tgt: this.tgt, fold: this.fold, appear: this.appear, failed: this.failed, vertices: this.meshBuf.n };
  };

  Viewer.prototype._buildGhost = function () {
    if (this.failed || !this.ghostOn || !this.shape) { this.ghostCount = 0; return; }
    var g = Geo.ghost(this.shape, this.ref.w, this.ref.h, this.ref.d);
    var gl = this.gl, n = Math.min(g.length / 3, 8000);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ghostVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, g.subarray(0, n * 3));
    this.ghostCount = n;
  };

  Viewer.prototype._rebuild = function () {
    if (this.failed || !this.shape) return;
    var gl = this.gl, b = this.meshBuf;
    this.info = Geo.build(this.shape, { w: this.cur.w, h: this.cur.h, d: this.cur.d, pitch: this.cur.pitch, fold: this.fold }, b);
    var n = b.n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.pos.subarray(0, n * 3));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.nor); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.nor.subarray(0, n * 3));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.ao); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.ao.subarray(0, n));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.mat); gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.mat.subarray(0, n));
    this.vcount = n;
    if (this.flow && this.flow.spec && this.info.flow) this.flow.retarget(this.info.flow);
    this._buildDims();
    this._labelsDirty = true;
  };

  Viewer.prototype._configureFlow = function (reset) {
    if (!this.flow || !this.info) return;
    var len = clamp(0.95 * Math.max(this.cur.w, this.cur.h), 380, 900);
    var o = this.opts.flowLen ? { up: this.opts.flowLen, down: this.opts.flowLen } : { up: len, down: len };
    o.speed = this.opts.flowSpeed || 330;
    if (reset || !this.flow.spec) this.flow.configure(this.info.flow, o);
    else this.flow.retarget(this.info.flow);
  };

  /* ───────────────────────── frame loop ───────────────────────── */

  /* Camera distance that keeps the default size (refR) fully in view; a bigger filter pushes the camera back a little. */
  Viewer.prototype._fitDist = function (ref, cur) {
    var lab = this.labelsOn;
    var refV = viewRadius(this.shape, ref.w, ref.h, ref.d, lab), curV = viewRadius(this.shape, cur.w, cur.h, cur.d, lab);
    var fitR = Math.max(refV, curV / 1.04) * WORLD;
    var aspect = this.canvas.width / this.canvas.height;
    var halfV = FOV / 2, halfH = Math.atan(Math.tan(halfV) * aspect);
    // the dimension labels are fixed-size pills, so keep a pixel margin at the sides or a narrow stage cuts them off
    var kx = lab ? Math.max(0.55, 1 - 44 / Math.max(1, (this.cssW || 1) / 2)) : 1;
    var d = Math.max(fitR / Math.sin(halfV), fitR / (Math.sin(halfH) * kx));
    return d * (lab ? 1 : (this.opts.distance || 1.4));
  };

  Viewer.prototype._kick = function () { this._start(); };

  Viewer.prototype._start = function () {
    if (this.running || this.failed || this.destroyed) return;
    this.running = true;
    var self = this, last = performance.now();
    function frame(now) {
      if (self.destroyed) return;
      if (!self.visible || document.hidden || self.lost) { self.running = false; return; }
      var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      self._tick(dt);
      self._render();
      if (self.onframe) self.onframe(self);
      root.requestAnimationFrame(frame);
    }
    root.requestAnimationFrame(function (t) { last = t; frame(t); });
  };

  Viewer.prototype._tick = function (dt) {
    this.time += dt;
    var t = this.time, k;

    // transition between models / intro
    var tr = this.tr;
    if (tr) {
      tr.t += dt;
      if (tr.phase === 'out') {
        var u = clamp(tr.t / 0.28, 0, 1);
        this.appear = 1 - easeInCubic(u);
        this.spin = u * 0.9;
        if (u >= 1) {
          var nx = tr.next;
          this._applyModel(nx.shape, nx.dims, nx.ref);
          this.fold = 0; this.appear = 0;
          this.tr = tr = { phase: 'in', t: 0 };
        }
      }
      if (tr.phase === 'in') {
        var ti = tr.t;
        if (ti < 0) { this.appear = 0; this.fold = 0; }
        else {
          this.appear = easeOutBack(clamp(ti / 0.6, 0, 1));
          this.fold = easeOutCubic(clamp((ti - 0.15) / 0.85, 0, 1));
          this.spin = (1 - clamp(ti / 0.6, 0, 1)) * -0.9;
          if (ti >= 1.0) { this.appear = 1; this.fold = 1; this.spin = 0; this.tr = null; }
        }
        this._foldDirty = true;
      }
    }

    // dimensions & pleat pitch ease toward their targets
    k = expk(dt, 9);
    var changed = !!this._foldDirty;
    this._foldDirty = false;
    var keys = ['w', 'h', 'd', 'pitch'];
    for (var i = 0; i < 4; i++) {
      var key = keys[i], diff = this.tgt[key] - this.cur[key];
      if (diff !== 0) {
        if (Math.abs(diff) < 0.03) this.cur[key] = this.tgt[key]; else this.cur[key] += diff * k;
        changed = true;
      }
    }
    if (changed && this.shape) this._rebuild();

    // colours & surface
    k = expk(dt, 8);
    for (var c = 0; c < 3; c++) {
      this.colors.frame[c] += (this.colorsT.frame[c] - this.colors.frame[c]) * k;
      this.colors.media[c] += (this.colorsT.media[c] - this.colors.media[c]) * k;
    }
    this.surf.metal += (this.surfT.metal - this.surf.metal) * k;
    this.surf.rough += (this.surfT.rough - this.surf.rough) * k;

    // camera distance
    var want = this._fitDist(this.ref, this.cur);
    if (this.dist === 20 || this.reduced) this.dist = want; else this.dist += (want - this.dist) * expk(dt, 4);

    // orientation
    var yawT, pitchT;
    this.idle += dt;
    this.ptr.x += (this.ptr.tx - this.ptr.x) * expk(dt, 3);
    this.ptr.y += (this.ptr.ty - this.ptr.y) * expk(dt, 3);
    if (this.mode === 'hero') {
      yawT = this.yawBase + (this.reduced ? 0 : Math.sin(t * 0.3) * 0.1) + this.ptr.x * 0.24 + this.scroll * 0.95;
      pitchT = this.pitchBase + this.ptr.y * 0.08 - this.scroll * 0.12;
    } else {
      var aw = this.reduced ? 0 : clamp((this.idle - 2.5) / 1.5, 0, 1);
      yawT = this.yawBase + aw * Math.sin(t * 0.42) * 0.5;
      pitchT = this.pitchBase + aw * Math.sin(t * 0.33) * 0.03;
    }
    if (this.dragging) { this.yaw = yawT; this.pitch = pitchT; }
    else { this.yaw += (yawT - this.yaw) * expk(dt, 6); this.pitch += (pitchT - this.pitch) * expk(dt, 6); }
    this.bob = this.reduced ? 0 : Math.sin(t * 0.9) * 0.05;

    // ghost outline of the default size
    var dev = 0;
    if (this.ghostOn && this.shape) {
      dev = Math.max(Math.abs(this.cur.w / this.ref.w - 1), Math.abs(this.cur.h / this.ref.h - 1), Math.abs(this.cur.d / this.ref.d - 1));
      if (this.shape === 'round') dev = Math.max(Math.abs(this.cur.w / this.ref.w - 1), Math.abs(this.cur.d / this.ref.d - 1));
    }
    this.ghostA += ((dev > 0.006 ? 1 : 0) - this.ghostA) * expk(dt, 6);

    // airflow
    this.flowIntensity += ((this.airflow ? 1 : 0) - this.flowIntensity) * expk(dt, 4);
    if (this.flow && this.flow.spec) {
      this.flow.step(this.reduced ? 0 : dt, this.flowIntensity);
      var gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptVbo.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flow.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptVbo.col); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flow.col);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptVbo.size); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flow.size);
    }

    // keep drawing while anything is moving; otherwise settle (but keep the light animation going)
    this.moving = true;
  };

  /* ───────────────────────── drawing ───────────────────────── */

  Viewer.prototype._attribs = function (n) {
    var gl = this.gl;
    for (var i = 0; i < 4; i++) { if (i < n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); }
  };

  Viewer.prototype._render = function () {
    var gl = this.gl;
    if (!gl || !this.shape) return;
    var cv = this.canvas;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var proj = M4.perspective(FOV, cv.width / cv.height, 0.5, 300, this.shiftNdc);
    var view = M4.mul(M4.translate(0, 0, -this.dist), M4.rotX(TILT));
    var vp = M4.mul(proj, view);
    var sc = WORLD * Math.max(this.appear, 0.0001);
    var model = M4.mul(M4.translate(0, this.bob, 0), M4.mul(M4.rotX(this.pitch), M4.mul(M4.rotY(this.yaw + this.spin), M4.scale(sc))));
    var mvp = M4.mul(vp, model);
    this._mvp = mvp; this._vp = vp;
    var camX = 0, camY = this.dist * Math.sin(TILT), camZ = this.dist * Math.cos(TILT);

    // floor shadow + turntable ring
    if (this.shadowOn) {
      var refR = radiusFor(this.shape, this.ref.w, this.ref.h, this.ref.d);
      var floorY = -(halfHeightFor(this.shape, this.ref.w, this.ref.h) + 0.1 * Math.max(this.ref.w, this.ref.h)) * WORLD;
      gl.useProgram(this.pBlob.p); this._attribs(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.blobVbo);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(this.pBlob.u.uMVP, false, vp);
      gl.uniform3f(this.pBlob.u.uCenter, 0, floorY, 0);
      gl.uniform1f(this.pBlob.u.uRadius, refR * WORLD * 1.35);
      gl.uniform1f(this.pBlob.u.uAlpha, 0.55 * Math.min(1, this.appear));
      gl.uniform3f(this.pBlob.u.uTint, 0.24, 0.86, 0.79);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      gl.enable(gl.DEPTH_TEST);
    }

    // filter body
    gl.disable(gl.BLEND);
    var P = this.pMesh, u = P.u, f = this.colors.frame, m = this.colors.media;
    gl.useProgram(P.p);
    this._attribs(4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.pos); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.nor); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.ao); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo.mat); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.uMVP, false, mvp);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3f(u.uCam, camX, camY, camZ);
    gl.uniform3f(u.uCol0, m[0], m[1], m[2]);
    gl.uniform3f(u.uCol1, f[0], f[1], f[2]);
    var dk = mix3(f, [0.004, 0.005, 0.006], 0.82), cr = mix3(f, [0.004, 0.005, 0.006], 0.55);
    gl.uniform3f(u.uCol2, dk[0], dk[1], dk[2]);
    gl.uniform3f(u.uCol3, cr[0], cr[1], cr[2]);
    gl.uniform2f(u.uSurf0, 0.0, 0.88);
    gl.uniform2f(u.uSurf1, this.surf.metal, this.surf.rough);
    gl.uniform2f(u.uSurf2, 0.6, 0.5);
    gl.uniform2f(u.uSurf3, 0.7, 0.42);
    gl.drawArrays(gl.TRIANGLES, 0, this.vcount);

    // lines: ghost outline of the default size + dimension lines
    gl.useProgram(this.pLine.p);
    this._attribs(1);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(this.pLine.u.uMVP, false, mvp);
    if (this.ghostOn && this.ghostA > 0.02 && this.ghostCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ghostVbo); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4f(this.pLine.u.uColor, 0.88, 0.63, 0.35, 0.8 * this.ghostA);
      gl.drawArrays(gl.LINES, 0, this.ghostCount);
    }
    if (this.labelsOn && this.dimCount && this.appear > 0.6 && this.fold > 0.6) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dimVbo); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4f(this.pLine.u.uColor, 0.24, 0.86, 0.79, 0.95);
      gl.drawArrays(gl.LINES, 0, this.dimCount);
    }

    // airflow particles
    if (this.flow && this.flow.spec && this.flowIntensity > 0.01) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.useProgram(this.pPt.p);
      this._attribs(3);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptVbo.pos); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptVbo.col); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptVbo.size); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(this.pPt.u.uMVP, false, mvp);
      gl.uniform1f(this.pPt.u.uScale, WORLD * (cv.height / 2) / Math.tan(FOV / 2));
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, this.flow.n);
      gl.depthMask(true);
    }
    gl.enable(gl.DEPTH_TEST);

    this._updateOverlay(mvp);
  };

  Viewer.prototype.destroy = function () {
    this.destroyed = true;
    if (this._ro) this._ro.disconnect();
    if (this._io) this._io.disconnect();
    if (this._onWin) root.removeEventListener('resize', this._onWin);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    if (this._unbind) this._unbind();
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  };

  Viewer.radiusFor = radiusFor;
  Viewer.viewRadius = viewRadius;
  root.SorsViewer = Viewer;
})(typeof window !== 'undefined' ? window : globalThis);
