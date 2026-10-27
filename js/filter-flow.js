/* filter-flow.js — the "dusty air in, clean air out" particle stream (pure maths, millimetres).
   Particles are caught by the media with a probability, the rest change colour as they pass through. */
(function (root) {
  'use strict';

  var DIRTY = [0.88, 0.63, 0.35], CLEAN = [0.24, 0.86, 0.79];
  var CATCH = 0.4;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function sstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  function Flow(n) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    // per particle state
    this.s = new Float32Array(n);       // progress 0..1 along the path
    this.u = new Float32Array(n);       // lateral coordinate 1 (x, or angle)
    this.v = new Float32Array(n);       // lateral coordinate 2 (y)
    this.sp = new Float32Array(n);      // speed multiplier
    this.ph = new Float32Array(n);      // wobble phase
    this.caught = new Uint8Array(n);
    this.base = new Float32Array(n);    // base size
    this.spec = null;
    this.up = 700;                      // upstream length, mm
    this.down = 700;                    // downstream length, mm
    this.speed = 330;                   // mm / s
    this.time = 0;
  }

  Flow.prototype.configure = function (spec, opts) {
    opts = opts || {};
    this.spec = spec;
    if (opts.up) this.up = opts.up;
    if (opts.down) this.down = opts.down;
    if (opts.speed) this.speed = opts.speed;
    var first = !this.ready;
    for (var i = 0; i < this.n; i++) this.respawn(i, first ? Math.random() : null);
    this.ready = true;
  };

  /* Same shape, new size: keep the particles but squeeze their lateral positions into the new opening. */
  Flow.prototype.retarget = function (spec) {
    var old = this.spec;
    if (!old || old.kind !== spec.kind) { this.configure(spec); return; }
    var ku = 1, kv = 1;
    if (spec.kind === 'radial') { kv = spec.hl / old.hl; }
    else if (spec.round) { ku = kv = spec.hw / old.hw; }
    else { ku = spec.hw / old.hw; kv = spec.hh / old.hh; }
    if (isFinite(ku) && isFinite(kv)) {
      for (var i = 0; i < this.n; i++) { if (spec.kind !== 'radial') this.u[i] *= ku; this.v[i] *= kv; }
    }
    this.spec = spec;
  };

  Flow.prototype.respawn = function (i, s) {
    var sp = this.spec; if (!sp) return;
    this.s[i] = s == null ? 0 : s;
    this.sp[i] = rnd(0.7, 1.35);
    this.ph[i] = rnd(0, 6.283);
    this.caught[i] = Math.random() < CATCH ? 1 : 0;
    this.base[i] = this.caught[i] ? rnd(5, 9) : rnd(3.5, 7);
    if (sp.kind === 'radial') {
      this.u[i] = rnd(0, 6.2832);
      this.v[i] = rnd(-sp.hl, sp.hl);
    } else if (sp.round) {
      var a = rnd(0, 6.2832), r = Math.sqrt(Math.random()) * sp.hw;
      this.u[i] = Math.cos(a) * r; this.v[i] = Math.sin(a) * r;
      if (sp.hole && r < sp.hole) { this.u[i] *= 2.4; this.v[i] *= 2.4; if (Math.hypot(this.u[i], this.v[i]) > sp.hw) { this.u[i] *= 0.4; this.v[i] *= 0.4; } }
    } else {
      this.u[i] = rnd(-sp.hw, sp.hw);
      this.v[i] = rnd(-sp.hh, sp.hh);
    }
  };

  function put(self, i, x, y, z, clean, alpha, size) {
    var o = i * 3, c = i * 4;
    self.pos[o] = x; self.pos[o + 1] = y; self.pos[o + 2] = z;
    var k = clean, r = DIRTY[0] + (CLEAN[0] - DIRTY[0]) * k, g = DIRTY[1] + (CLEAN[1] - DIRTY[1]) * k, b = DIRTY[2] + (CLEAN[2] - DIRTY[2]) * k;
    self.col[c] = r; self.col[c + 1] = g; self.col[c + 2] = b; self.col[c + 3] = alpha;
    self.size[i] = size;
  }

  Flow.prototype.step = function (dt, intensity) {
    var sp = this.spec; if (!sp) return;
    intensity = intensity == null ? 1 : intensity;
    this.time += dt;
    var t = this.time;
    for (var i = 0; i < this.n; i++) {
      var len, s;
      if (sp.kind === 'radial') {
        var rStart = sp.R + this.up * 0.55, axial = sp.hl + sp.capT + this.down * 0.8;
        len = (rStart - sp.rc) + (axial - 0);
        this.s[i] += dt * this.speed * this.sp[i] / len * 1.0;
        s = this.s[i];
        if (s >= 1) { this.respawn(i, 0); s = 0; }
        var d = s * len, rad, y = this.v[i], clean = 0, alpha = 1, fadeOut = 1;
        var radialLen = rStart - sp.rc;
        var th = this.u[i];
        if (d < radialLen) {
          rad = rStart - d;
          clean = sstep(sp.R + 6, sp.R - 40, rad);
          if (this.caught[i] && rad < sp.R) fadeOut = sstep(sp.R - 38, sp.R - 4, rad);
        } else {
          rad = Math.max(2, sp.rc * (1 - (d - radialLen) / (sp.rc * 4)));
          y = this.v[i] + (d - radialLen);
          clean = 1;
          if (this.caught[i]) fadeOut = 0;
        }
        alpha = sstep(0, 0.08, s) * sstep(1, 0.86, s) * fadeOut * (clean > 0.5 ? 0.85 : 0.6);
        var wob = Math.sin(t * 1.7 + this.ph[i]) * 6;
        put(this, i, Math.cos(th) * (rad + wob), y, Math.sin(th) * (rad + wob), clean, alpha * intensity, this.base[i] * (this.caught[i] ? 1 - 0.5 * (1 - fadeOut) : 1));
        continue;
      }
      var zS = sp.z0 + this.up, zE = sp.z1 - this.down;
      len = zS - zE;
      this.s[i] += dt * this.speed * this.sp[i] / len;
      s = this.s[i];
      if (s >= 1) { this.respawn(i, 0); s = 0; }
      var z = zS - s * len;
      var past = sp.zFlip - z;                           // > 0 once through the media
      var cl = sstep(-30, 160, past);
      var fo = 1;
      if (this.caught[i]) fo = 1 - sstep(10, 120, past);
      var al = sstep(0, 0.07, s) * sstep(1, 0.8, s) * fo * (cl > 0.5 ? 0.85 : 0.62);
      var amp = cl > 0.5 ? 9 : 5;
      var x = this.u[i] + Math.sin(t * 1.3 + this.ph[i]) * amp, yy = this.v[i] + Math.cos(t * 1.1 + this.ph[i] * 1.3) * amp;
      put(this, i, x, yy, z, cl, al * intensity, this.base[i] * (this.caught[i] ? 1 - 0.45 * (1 - fo) : 1));
    }
  };

  var api = { Flow: Flow, DIRTY: DIRTY, CLEAN: CLEAN };
  root.SorsFlow = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
