/* gl-core.js — minimal WebGL helpers: 4×4 matrices (column-major), shader sources, program builder. */
(function (root) {
  'use strict';

  var M4 = {
    ident: function () { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul: function (a, b, out) {
      out = out || new Float32Array(16);
      for (var c = 0; c < 4; c++) {
        for (var r = 0; r < 4; r++) {
          out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return out;
    },
    perspective: function (fovy, aspect, near, far, shiftX) {
      var f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
      m[8] = -(shiftX || 0);
      return m;
    },
    translate: function (x, y, z) { var m = M4.ident(); m[12] = x; m[13] = y; m[14] = z; return m; },
    scale: function (s) { var m = M4.ident(); m[0] = m[5] = m[10] = s; return m; },
    rotX: function (a) { var m = M4.ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    rotY: function (a) { var m = M4.ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    /* transform point by matrix → [x, y, z, w] */
    apply: function (m, x, y, z) {
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13],
              m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
    }
  };

  function hexToLin(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0x888888;
    function lin(v) { v /= 255; return Math.pow(v, 2.2); }
    return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  }

  var MESH_VS = [
    'attribute vec3 aPos; attribute vec3 aNor; attribute float aAo; attribute float aMat;',
    'uniform mat4 uMVP; uniform mat4 uModel;',
    'varying vec3 vNor; varying vec3 vWorld; varying float vAo; varying float vMat;',
    'void main(){',
    '  vec4 w = uModel * vec4(aPos, 1.0);',
    '  vWorld = w.xyz; vNor = mat3(uModel) * aNor; vAo = aAo; vMat = aMat;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var MESH_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec3 uCam;',
    'uniform vec3 uCol0; uniform vec3 uCol1; uniform vec3 uCol2; uniform vec3 uCol3;',
    'uniform vec2 uSurf0; uniform vec2 uSurf1; uniform vec2 uSurf2; uniform vec2 uSurf3;',
    'varying vec3 vNor; varying vec3 vWorld; varying float vAo; varying float vMat;',
    'vec3 env(vec3 r, float rough){',
    '  float y = r.y;',
    '  vec3 c = mix(vec3(0.020,0.055,0.070), vec3(0.16,0.27,0.31), smoothstep(-0.40,0.05,y));',
    '  c = mix(c, vec3(0.50,0.68,0.74), smoothstep(0.0,0.95,y));',
    '  vec3 k1 = normalize(vec3(-0.55,0.65,0.55));',
    '  vec3 k2 = normalize(vec3(0.85,0.25,0.35));',
    '  vec3 k3 = normalize(vec3(0.10,0.20,-1.0));',
    '  float s1 = pow(max(dot(r,k1),0.0), mix(70.0,6.0,rough));',
    '  float s2 = pow(max(dot(r,k2),0.0), mix(45.0,5.0,rough));',
    '  float s3 = pow(max(dot(r,k3),0.0), mix(30.0,4.0,rough));',
    '  c += vec3(1.0,0.98,0.95)*s1*3.2 + vec3(0.8,0.95,1.0)*s2*1.9 + vec3(0.25,0.9,0.8)*s3*1.6;',
    '  return c;',
    '}',
    'void main(){',
    '  float m = vMat;',
    '  vec3 col = uCol0; vec2 sf = uSurf0;',
    '  col = mix(col, uCol1, step(0.5,m)); sf = mix(sf, uSurf1, step(0.5,m));',
    '  col = mix(col, uCol2, step(1.5,m)); sf = mix(sf, uSurf2, step(1.5,m));',
    '  col = mix(col, uCol3, step(2.5,m)); sf = mix(sf, uSurf3, step(2.5,m));',
    '  float metal = sf.x, rough = sf.y;',
    '  vec3 N = normalize(vNor); vec3 V = normalize(uCam - vWorld);',
    '  if (dot(N,V) < 0.0) N = -N;',
    '  vec3 L1 = normalize(vec3(-0.45,0.75,0.60));',
    '  vec3 L2 = normalize(vec3(0.80,0.10,0.45));',
    '  vec3 L3 = normalize(vec3(0.20,0.30,-0.90));',
    '  float d1 = max(dot(N,L1),0.0), d2 = max(dot(N,L2),0.0), d3 = max(dot(N,L3),0.0);',
    '  vec3 amb = mix(vec3(0.05,0.085,0.10), vec3(0.34,0.44,0.48), N.y*0.5+0.5);',
    '  vec3 lit = amb + vec3(1.05,1.0,0.95)*d1*0.95 + vec3(0.55,0.75,0.85)*d2*0.45 + vec3(0.20,0.90,0.80)*d3*0.35;',
    '  float ao = vAo;',
    '  vec3 R = reflect(-V, N);',
    '  float nv = max(dot(N,V),0.0);',
    '  float fres = pow(1.0 - nv, 5.0);',
    '  vec3 F0 = mix(vec3(0.04), col, metal);',
    '  vec3 F = F0 + (vec3(1.0) - F0) * fres * (1.0 - rough*0.65);',
    '  vec3 e = env(R, rough);',
    '  vec3 c = col * lit * (1.0 - metal) * ao + e * F * mix(1.0, ao, 0.6);',
    '  c = (c*(2.51*c+0.03)) / (c*(2.43*c+0.59)+0.14);',
    '  c = pow(clamp(c,0.0,1.0), vec3(1.0/2.2));',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var LINE_VS = 'attribute vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position = uMVP * vec4(aPos,1.0); }';
  var LINE_FS = 'precision mediump float; uniform vec4 uColor; void main(){ gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a); }';

  var PT_VS = [
    'attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;',
    'uniform mat4 uMVP; uniform float uScale; varying vec4 vCol;',
    'void main(){',
    '  vec4 p = uMVP * vec4(aPos, 1.0);',
    '  gl_Position = p; vCol = aCol;',
    '  gl_PointSize = clamp(aSize * uScale / max(p.w, 0.01), 1.0, 48.0);',
    '}'
  ].join('\n');
  var PT_FS = [
    'precision mediump float; varying vec4 vCol;',
    'void main(){',
    '  float d = length(gl_PointCoord - vec2(0.5));',
    '  float a = smoothstep(0.5, 0.05, d); a = a * a;',
    '  gl_FragColor = vec4(vCol.rgb * vCol.a * a, vCol.a * a);',
    '}'
  ].join('\n');

  var BLOB_VS = 'attribute vec2 aUv; uniform mat4 uMVP; uniform vec3 uCenter; uniform float uRadius; varying vec2 vUv;' +
    ' void main(){ vUv = aUv; vec3 p = uCenter + vec3(aUv.x*uRadius, 0.0, aUv.y*uRadius); gl_Position = uMVP * vec4(p,1.0); }';
  var BLOB_FS = 'precision mediump float; varying vec2 vUv; uniform float uAlpha; uniform vec3 uTint;' +
    ' void main(){ float d = length(vUv); float a = smoothstep(1.0, 0.0, d); a = a*a*uAlpha;' +
    ' float ring = smoothstep(0.03, 0.0, abs(d - 0.86)) * 0.5;' +
    ' vec3 c = uTint * ring; gl_FragColor = vec4(c, a + ring * 0.6); }';

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  }

  function program(gl, vs, fs, attribs, uniforms) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    for (var i = 0; i < attribs.length; i++) gl.bindAttribLocation(p, i, attribs[i]);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    var u = {};
    for (var k = 0; k < uniforms.length; k++) u[uniforms[k]] = gl.getUniformLocation(p, uniforms[k]);
    return { p: p, u: u, n: attribs.length };
  }

  root.SorsGL = {
    M4: M4, hexToLin: hexToLin, program: program,
    SRC: { MESH_VS: MESH_VS, MESH_FS: MESH_FS, LINE_VS: LINE_VS, LINE_FS: LINE_FS, PT_VS: PT_VS, PT_FS: PT_FS, BLOB_VS: BLOB_VS, BLOB_FS: BLOB_FS }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SorsGL;
})(typeof window !== 'undefined' ? window : globalThis);
