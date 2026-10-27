/* filter-geo.js — pure geometry for the five filter models (no DOM, no WebGL, unit: millimetres).
   build(shape, p, buf) fills a MeshBuf with a triangle soup and returns { n, anchors, radius }.
   p = { w, h, d, pitch, fold }  — fold 0..1 is the "unfold" animation (pleats rise, pockets inflate). */
(function (root) {
  'use strict';

  var MEDIA = 0, FRAME = 1, DARK = 2, CORE = 3;   // material slots used by the shader
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function MeshBuf(cap) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.nor = new Float32Array(cap * 3);
    this.ao = new Float32Array(cap);
    this.mat = new Float32Array(cap);
    this.n = 0;
  }

  MeshBuf.prototype.tri = function (ax, ay, az, bx, by, bz, cx, cy, cz, a0, a1, a2, m) {
    if (this.n + 3 > this.cap) return;
    var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    var i = this.n, o = i * 3, p = this.pos, q = this.nor;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    q[o] = q[o + 3] = q[o + 6] = nx;
    q[o + 1] = q[o + 4] = q[o + 7] = ny;
    q[o + 2] = q[o + 5] = q[o + 8] = nz;
    this.ao[i] = a0; this.ao[i + 1] = a1; this.ao[i + 2] = a2;
    this.mat[i] = this.mat[i + 1] = this.mat[i + 2] = m;
    this.n += 3;
  };

  MeshBuf.prototype.quad = function (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, a0, a1, a2, a3, m) {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, a0, a1, a2, m);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, a0, a2, a3, m);
  };

  /* Axis-aligned box from two corners. */
  MeshBuf.prototype.box = function (x0, y0, z0, x1, y1, z1, m, ao) {
    var t;
    if (x0 > x1) { t = x0; x0 = x1; x1 = t; }
    if (y0 > y1) { t = y0; y0 = y1; y1 = t; }
    if (z0 > z1) { t = z0; z0 = z1; z1 = t; }
    ao = ao == null ? 1 : ao;
    this.quad(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, ao, ao, ao, ao, m);
    this.quad(x0, y0, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0, ao, ao, ao, ao, m);
    this.quad(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, ao, ao, ao, ao, m);
    this.quad(x0, y0, z1, x0, y0, z0, x1, y0, z0, x1, y0, z1, ao, ao, ao, ao, m);
    this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, ao, ao, ao, ao, m);
    this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, ao, ao, ao, ao, m);
  };

  /* Annulus between radii r0..r1 at axial position a. axis 'z' → ring lies in the XY plane, 'y' → in the XZ plane. */
  MeshBuf.prototype.ring = function (axis, r0, r1, a, segs, m, ao) {
    ao = ao == null ? 1 : ao;
    for (var j = 0; j < segs; j++) {
      var t0 = j / segs * TAU, t1 = (j + 1) / segs * TAU;
      var c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      if (axis === 'z') {
        this.quad(c0 * r0, s0 * r0, a, c0 * r1, s0 * r1, a, c1 * r1, s1 * r1, a, c1 * r0, s1 * r0, a, ao, ao, ao, ao, m);
      } else {
        this.quad(c0 * r0, a, s0 * r0, c0 * r1, a, s0 * r1, c1 * r1, a, s1 * r1, c1 * r0, a, s1 * r0, ao, ao, ao, ao, m);
      }
    }
  };

  /* Open cylinder surface of radius r between axial positions a0..a1. */
  MeshBuf.prototype.shell = function (axis, r, a0, a1, segs, m, ao) {
    ao = ao == null ? 1 : ao;
    for (var j = 0; j < segs; j++) {
      var t0 = j / segs * TAU, t1 = (j + 1) / segs * TAU;
      var c0 = Math.cos(t0) * r, s0 = Math.sin(t0) * r, c1 = Math.cos(t1) * r, s1 = Math.sin(t1) * r;
      if (axis === 'z') {
        this.quad(c0, s0, a0, c1, s1, a0, c1, s1, a1, c0, s0, a1, ao, ao, ao, ao, m);
      } else {
        this.quad(c0, a0, s0, c1, a0, s1, c1, a1, s1, c0, a1, s0, ao, ao, ao, ao, m);
      }
    }
  };

  /* Pleated strip along a straight path in the XZ plane, extruded along Y (y0..y1).
     Ridges alternate to the +normal and -normal side of the path. */
  function pleatStrip(buf, x0, z0, x1, z1, y0, y1, pitch, amp, fold, m, aoHi, aoLo) {
    var dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return;
    var tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
    var segs = Math.max(2, Math.round(len / (pitch / 2)));
    var step = len / segs, a = amp * fold;
    var px = x0 + nx * a, pz = z0 + nz * a, pao = aoHi;
    for (var j = 1; j <= segs; j++) {
      var side = (j % 2 === 0) ? 1 : -1, s = j * step;
      var cx = x0 + tx * s + nx * a * side, cz = z0 + tz * s + nz * a * side;
      var ao = side > 0 ? aoHi : aoLo;
      buf.quad(px, y0, pz, cx, y0, cz, cx, y1, cz, px, y1, pz, pao, ao, ao, pao, m);
      px = cx; pz = cz; pao = ao;
    }
  }

  /* Pleated cylinder wall (cartridge): ridges at rOut, valleys at rOut-depth*fold. */
  function pleatRing(buf, rOut, depth, y0, y1, segs, fold, m) {
    var rIn = rOut - depth * fold;
    for (var j = 0; j < segs; j++) {
      var t0 = j / segs * TAU, t1 = (j + 1) / segs * TAU;
      var e0 = (j % 2 === 0), r0 = e0 ? rOut : rIn, r1 = e0 ? rIn : rOut;
      var a0 = e0 ? 1 : 0.5, a1 = e0 ? 0.5 : 1;
      buf.quad(Math.cos(t0) * r0, y0, Math.sin(t0) * r0, Math.cos(t1) * r1, y0, Math.sin(t1) * r1,
               Math.cos(t1) * r1, y1, Math.sin(t1) * r1, Math.cos(t0) * r0, y1, Math.sin(t0) * r0, a0, a1, a1, a0, m);
    }
  }

  /* Radial pleats of a round panel filter, lying in the XY plane around z = zc. */
  function pleatDisc(buf, rIn, rOut, zc, amp, segs, fold, m) {
    var a = amp * fold;
    for (var j = 0; j < segs; j++) {
      var t0 = j / segs * TAU, t1 = (j + 1) / segs * TAU;
      var s0 = (j % 2 === 0) ? 1 : -1, s1 = -s0;
      var c0 = Math.cos(t0), n0 = Math.sin(t0), c1 = Math.cos(t1), n1 = Math.sin(t1);
      var o0 = s0 > 0 ? 1 : 0.55, o1 = s1 > 0 ? 1 : 0.55;
      buf.quad(c0 * rIn, n0 * rIn, zc + s0 * a, c0 * rOut, n0 * rOut, zc + s0 * a,
               c1 * rOut, n1 * rOut, zc + s1 * a, c1 * rIn, n1 * rIn, zc + s1 * a, o0, o0, o1, o1, m);
    }
  }

  function frameWidth(w, h) { return clamp(0.035 * Math.min(w, h), 9, 26); }

  /* ───────────────────────────── models ───────────────────────────── */

  function dimOffset(w, h) { return 0.08 * Math.max(w, h) + 22; }

  function buildPanel(buf, p) {
    var W = p.w, H = p.h, D = p.d, f = p.fold, ft = frameWidth(W, H);
    var iw = W - 2 * ft, ih = H - 2 * ft, hz = D / 2, lip = ft * 0.5, lt = 1.8;
    var amp = Math.max(1, hz - 1.4);
    pleatStrip(buf, -iw / 2, 0, iw / 2, 0, -ih / 2, ih / 2, p.pitch, amp, f, MEDIA, 1, 0.52);
    buf.box(-W / 2, H / 2 - ft, -hz, W / 2, H / 2, hz, FRAME);
    buf.box(-W / 2, -H / 2, -hz, W / 2, -H / 2 + ft, hz, FRAME);
    buf.box(-W / 2, -H / 2 + ft, -hz, -W / 2 + ft, H / 2 - ft, hz, FRAME);
    buf.box(W / 2 - ft, -H / 2 + ft, -hz, W / 2, H / 2 - ft, hz, FRAME);
    // rolled lips on both faces
    var zs = [hz - lt, hz, -hz, -hz + lt];
    for (var k = 0; k < 2; k++) {
      var za = zs[k * 2], zb = zs[k * 2 + 1];
      buf.box(-iw / 2, ih / 2 - lip, za, iw / 2, ih / 2, zb, FRAME);
      buf.box(-iw / 2, -ih / 2, za, iw / 2, -ih / 2 + lip, zb, FRAME);
      buf.box(-iw / 2, -ih / 2 + lip, za, -iw / 2 + lip, ih / 2 - lip, zb, FRAME);
      buf.box(iw / 2 - lip, -ih / 2 + lip, za, iw / 2, ih / 2 - lip, zb, FRAME);
    }
    // support wires across the upstream face
    var nw = clamp(Math.round(ih / 110), 2, 8);
    for (var i = 1; i <= nw; i++) {
      var y = -ih / 2 + ih * i / (nw + 1);
      buf.box(-iw / 2, y - 0.8, hz - 1.6, iw / 2, y + 0.8, hz - 0.1, DARK);
    }
    var off = dimOffset(W, H);
    return {
      radius: Math.sqrt(W * W + H * H + D * D) / 2,
      anchors: {
        w: { a: [-W / 2, -H / 2 - off, hz], b: [W / 2, -H / 2 - off, hz], ea: [-W / 2, -H / 2, hz], eb: [W / 2, -H / 2, hz], axis: 'x' },
        h: { a: [W / 2 + off, -H / 2, hz], b: [W / 2 + off, H / 2, hz], ea: [W / 2, -H / 2, hz], eb: [W / 2, H / 2, hz], axis: 'y' },
        d: { a: [W / 2 + off, -H / 2, hz], b: [W / 2 + off, -H / 2, -hz], ea: [W / 2, -H / 2, hz], eb: [W / 2, -H / 2, -hz], axis: 'z' }
      },
      flow: { kind: 'z', hw: iw / 2, hh: ih / 2, round: false, z0: hz, z1: -hz, zFlip: 0 }
    };
  }

  function buildRound(buf, p) {
    var Dia = p.w, D = p.d, f = p.fold, R = Dia / 2, hz = D / 2;
    var rw = clamp(0.045 * Dia, 8, 26), hubR = Math.max(14, 0.2 * R);
    var rIn = hubR * 0.9, rOut = R - rw * 0.8;
    var segs = 2 * Math.max(8, Math.round(TAU * (rIn + rOut) / 2 / p.pitch));
    var cs = clamp(Math.round(R / 3), 40, 96);
    pleatDisc(buf, rIn, rOut, 0, Math.max(1, hz - 1.4), segs, f, MEDIA);
    buf.shell('z', R, -hz, hz, cs, FRAME);
    buf.shell('z', R - rw, -hz, hz, cs, FRAME, 0.8);
    buf.ring('z', R - rw, R, hz, cs, FRAME);
    buf.ring('z', R - rw, R, -hz, cs, FRAME);
    buf.ring('z', 0, hubR, hz, 40, FRAME);
    buf.ring('z', 0, hubR, -hz, 40, FRAME);
    buf.shell('z', hubR, -hz, hz, 40, FRAME);
    var off = dimOffset(Dia, Dia);
    return {
      radius: Math.sqrt(R * R + hz * hz),
      anchors: {
        w: { a: [-R, -R - off, hz], b: [R, -R - off, hz], ea: null, eb: null, axis: 'x', prefix: '\u2300 ' },
        h: null,
        d: { a: [R + off, 0, hz], b: [R + off, 0, -hz], ea: [R, 0, hz], eb: [R, 0, -hz], axis: 'z' }
      },
      flow: { kind: 'z', hw: rOut, hh: rOut, round: true, z0: hz, z1: -hz, zFlip: 0, hole: hubR }
    };
  }

  function buildCartridge(buf, p) {
    var Dia = p.w, L = p.h, D = p.d, f = p.fold, R = Dia / 2, hl = L / 2;
    var pleatDepth = Math.min(0.82 * D, R * 0.6);
    var rc = Math.max(R * 0.18, R - D);
    var capT = clamp(0.03 * L, 10, 18), capR = R + 3;
    var rMid = R - pleatDepth / 2;
    var segs = 2 * Math.max(10, Math.round(TAU * rMid / p.pitch));
    var cs = clamp(Math.round(R / 3), 40, 90);
    pleatRing(buf, R, pleatDepth, -hl, hl, segs, f, MEDIA);
    buf.shell('y', rc, -hl, hl + capT, cs, CORE);
    buf.shell('y', capR, hl, hl + capT, cs, FRAME);
    buf.ring('y', rc, capR, hl + capT, cs, FRAME);
    buf.ring('y', rc, capR, hl, cs, FRAME, 0.7);
    buf.shell('y', capR, -hl - capT, -hl, cs, FRAME);
    buf.ring('y', 0, capR, -hl - capT, cs, FRAME);
    buf.ring('y', rc, capR, -hl, cs, FRAME, 0.7);
    buf.shell('y', R + 0.7, hl * 0.5 - 5, hl * 0.5 + 5, cs, DARK);
    buf.shell('y', R + 0.7, -hl * 0.5 - 5, -hl * 0.5 + 5, cs, DARK);
    var off = 0.08 * Math.max(Dia, L) + 22;
    return {
      radius: Math.sqrt(capR * capR + Math.pow(hl + capT, 2)),
      anchors: {
        w: { a: [-R, hl + capT + off, 0], b: [R, hl + capT + off, 0], ea: [-R, hl + capT, 0], eb: [R, hl + capT, 0], axis: 'x', prefix: '\u2300 ' },
        h: { a: [capR + off, -hl, 0], b: [capR + off, hl, 0], ea: [capR, -hl, 0], eb: [capR, hl, 0], axis: 'y' },
        d: null
      },
      flow: { kind: 'radial', R: R, rc: rc, hl: hl, capT: capT }
    };
  }

  function buildPocket(buf, p) {
    var W = p.w, H = p.h, D = p.d, f = p.fold, ft = frameWidth(W, H);
    var fd = clamp(0.06 * D, 18, 30), hz = D / 2;
    var iw = W - 2 * ft, ih = H - 2 * ft;
    var n = root.SorsCatalog ? root.SorsCatalog.pocketCount(W) : clamp(Math.round(W / 95), 3, 8);
    var wb = iw / n, zm = hz - fd, zt = zm - (zm - (-hz)) * f;
    var bulge = 0.11 * wb * f, K = 5, y0 = -ih / 2, y1 = ih / 2;
    for (var i = 0; i < n; i++) {
      var xc = -iw / 2 + wb * (i + 0.5), xl = xc - wb / 2, xr = xc + wb / 2;
      for (var side = -1; side <= 1; side += 2) {
        var xe = side < 0 ? xl : xr;
        var px = xe, pz = zm, pb = 0, pa = 1;
        for (var k = 1; k <= K; k++) {
          var t = k / K, cx = xe + (xc - xe) * t, cz = zm + (zt - zm) * t;
          var b = bulge * Math.sin(Math.PI * t) * side;
          var ao = 1 - 0.5 * t;
          buf.quad(px + pb, y0, pz, cx + b, y0, cz, cx + b, y1, cz, px + pb, y1, pz, pa, ao, ao, pa, MEDIA);
          px = cx; pz = cz; pb = b; pa = ao;
        }
      }
      buf.tri(xl, y1, zm, xr, y1, zm, xc, y1, zt, 1, 1, 0.5, MEDIA);
      buf.tri(xl, y0, zm, xr, y0, zm, xc, y0, zt, 1, 1, 0.5, MEDIA);
    }
    buf.box(-W / 2, H / 2 - ft, zm, W / 2, H / 2, hz, FRAME);
    buf.box(-W / 2, -H / 2, zm, W / 2, -H / 2 + ft, hz, FRAME);
    buf.box(-W / 2, -H / 2 + ft, zm, -W / 2 + ft, H / 2 - ft, hz, FRAME);
    buf.box(W / 2 - ft, -H / 2 + ft, zm, W / 2, H / 2 - ft, hz, FRAME);
    for (var s = 1; s < n; s++) {
      var xs = -iw / 2 + wb * s;
      buf.box(xs - 1.6, -ih / 2, zm, xs + 1.6, ih / 2, hz - 2, DARK);
    }
    var off = dimOffset(W, H);
    return {
      radius: Math.sqrt(W * W + H * H + D * D) / 2,
      anchors: {
        w: { a: [-W / 2, -H / 2 - off, hz], b: [W / 2, -H / 2 - off, hz], ea: [-W / 2, -H / 2, hz], eb: [W / 2, -H / 2, hz], axis: 'x' },
        h: { a: [W / 2 + off, -H / 2, hz], b: [W / 2 + off, H / 2, hz], ea: [W / 2, -H / 2, hz], eb: [W / 2, H / 2, hz], axis: 'y' },
        d: { a: [W / 2 + off, -H / 2, hz], b: [W / 2 + off, -H / 2, -hz], ea: [W / 2, -H / 2, hz], eb: [W / 2, -H / 2, -hz], axis: 'z' }
      },
      flow: { kind: 'z', hw: iw / 2, hh: ih / 2, round: false, z0: hz, z1: -hz, zFlip: -D * 0.18 }
    };
  }

  function buildVBank(buf, p) {
    var W = p.w, H = p.h, D = p.d, f = p.fold, ft = frameWidth(W, H);
    var fd = clamp(0.07 * D, 16, 26), hz = D / 2, wall = 3;
    var iw = W - 2 * ft, ih = H - 2 * ft;
    var m = root.SorsCatalog ? root.SorsCatalog.vCount(W) : clamp(Math.round(W / 150), 2, 5);
    var wv = iw / m, zm = hz - fd - 2, za = zm - (zm - (-hz + 10)) * f;
    var amp = clamp(wv * 0.07, 6, 12);
    for (var i = 0; i < m; i++) {
      var xl = -iw / 2 + wv * i, xc = xl + wv / 2, xr = xl + wv;
      pleatStrip(buf, xl, zm, xc, za, -ih / 2, ih / 2, p.pitch, amp, f, MEDIA, 1, 0.5);
      pleatStrip(buf, xc, za, xr, zm, -ih / 2, ih / 2, p.pitch, amp, f, MEDIA, 1, 0.5);
    }
    // front frame
    buf.box(-W / 2, H / 2 - ft, hz - fd, W / 2, H / 2, hz, FRAME);
    buf.box(-W / 2, -H / 2, hz - fd, W / 2, -H / 2 + ft, hz, FRAME);
    buf.box(-W / 2, -H / 2 + ft, hz - fd, -W / 2 + ft, H / 2 - ft, hz, FRAME);
    buf.box(W / 2 - ft, -H / 2 + ft, hz - fd, W / 2, H / 2 - ft, hz, FRAME);
    // side walls
    buf.box(-W / 2, H / 2 - wall, -hz, W / 2, H / 2, hz - fd, FRAME, 0.9);
    buf.box(-W / 2, -H / 2, -hz, W / 2, -H / 2 + wall, hz - fd, FRAME, 0.9);
    buf.box(-W / 2, -H / 2 + wall, -hz, -W / 2 + wall, H / 2 - wall, hz - fd, FRAME, 0.9);
    buf.box(W / 2 - wall, -H / 2 + wall, -hz, W / 2, H / 2 - wall, hz - fd, FRAME, 0.9);
    // seals between neighbouring V packs at the front
    for (var s = 1; s < m; s++) {
      var xs = -iw / 2 + wv * s;
      buf.box(xs - 2, -ih / 2, zm - 2, xs + 2, ih / 2, hz - fd + 1, DARK);
    }
    var off = dimOffset(W, H);
    return {
      radius: Math.sqrt(W * W + H * H + D * D) / 2,
      anchors: {
        w: { a: [-W / 2, -H / 2 - off, hz], b: [W / 2, -H / 2 - off, hz], ea: [-W / 2, -H / 2, hz], eb: [W / 2, -H / 2, hz], axis: 'x' },
        h: { a: [W / 2 + off, -H / 2, hz], b: [W / 2 + off, H / 2, hz], ea: [W / 2, -H / 2, hz], eb: [W / 2, H / 2, hz], axis: 'y' },
        d: { a: [W / 2 + off, -H / 2, hz], b: [W / 2 + off, -H / 2, -hz], ea: [W / 2, -H / 2, hz], eb: [W / 2, -H / 2, -hz], axis: 'z' }
      },
      flow: { kind: 'z', hw: iw / 2, hh: ih / 2, round: false, z0: hz, z1: -hz, zFlip: -D * 0.2 }
    };
  }

  var BUILDERS = { panel: buildPanel, round: buildRound, cartridge: buildCartridge, pocket: buildPocket, vbank: buildVBank };

  function build(shape, p, buf) {
    buf.n = 0;
    var info = (BUILDERS[shape] || buildPanel)(buf, p);
    info.n = buf.n;
    return info;
  }

  /* ─────────── dashed outline of the default size (the "ghost") ─────────── */

  function dashed(out, ax, ay, az, bx, by, bz, dash, gap) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return;
    var ux = dx / len, uy = dy / len, uz = dz / len, s = 0;
    while (s < len) {
      var e = Math.min(len, s + dash);
      out.push(ax + ux * s, ay + uy * s, az + uz * s, ax + ux * e, ay + uy * e, az + uz * e);
      s += dash + gap;
    }
  }

  function ghost(shape, w, h, d) {
    var out = [], u = Math.max(w, h, d) * 0.028, dash = u, gap = u * 0.8;
    var x = w / 2, y = h / 2, z = d / 2;
    if (shape === 'round' || shape === 'cartridge') {
      var R = w / 2, ya = shape === 'round' ? 0 : h / 2, zc = shape === 'round' ? d / 2 : 0, segs = 72;
      for (var side = -1; side <= 1; side += 2) {
        for (var j = 0; j < segs; j++) {
          var t0 = j / segs * TAU, t1 = (j + 1) / segs * TAU;
          if (j % 2) continue;
          if (shape === 'round') out.push(Math.cos(t0) * R, Math.sin(t0) * R, side * zc, Math.cos(t1) * R, Math.sin(t1) * R, side * zc);
          else out.push(Math.cos(t0) * R, side * ya, Math.sin(t0) * R, Math.cos(t1) * R, side * ya, Math.sin(t1) * R);
        }
      }
      for (var q = 0; q < 4; q++) {
        var tq = q * Math.PI / 2, cq = Math.cos(tq) * R, sq = Math.sin(tq) * R;
        if (shape === 'round') dashed(out, cq, sq, -zc, cq, sq, zc, dash, gap);
        else dashed(out, cq, -ya, sq, cq, ya, sq, dash, gap);
      }
    } else {
      var cs = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
      var ed = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (var e = 0; e < ed.length; e++) {
        var A = cs[ed[e][0]], B = cs[ed[e][1]];
        dashed(out, A[0], A[1], A[2], B[0], B[1], B[2], dash, gap);
      }
    }
    return new Float32Array(out);
  }

  var api = { MeshBuf: MeshBuf, build: build, ghost: ghost, MEDIA: MEDIA, FRAME: FRAME, DARK: DARK, CORE: CORE };
  root.SorsGeo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
