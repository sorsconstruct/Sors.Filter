/* catalog.js — models, options and the client-side price estimate.
   All prices are placeholders. The server must always recompute the final price. */
(function (root) {
  'use strict';

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* Filter classes. rate = EUR per m² of filter media. level = bar length in the "classes" list. */
  var CLASSES = {
    G4:  { rate: 1.8, level: 1 },
    M5:  { rate: 2.4, level: 2 },
    F7:  { rate: 3.6, level: 3 },
    F9:  { rate: 5.2, level: 4 },
    H13: { rate: 24,  level: 5 }
  };

  /* Layout shapes. limits are in mm: [min, max]. custom = default W,H,D (mm) when the shape is picked in "Custom". */
  var SHAPES = {
    panel:     { dims: ['width', 'height', 'depth'],         limits: { w: [50, 1500],  h: [50, 1500],  d: [10, 300] },  custom: [200, 100, 50],  factor: 1.0 },
    round:     { dims: ['diameter', null, 'depth'],          limits: { w: [50, 1000],  h: [50, 1000],  d: [10, 150] },  custom: [200, 200, 40],  factor: 1.08, linkWH: true },
    cartridge: { dims: ['diameter', 'length', 'pleatDepth'], limits: { w: [60, 600],   h: [100, 1500], d: [15, 150] },  custom: [150, 300, 40],  factor: 1.25 },
    pocket:    { dims: ['width', 'height', 'depth'],         limits: { w: [100, 1200], h: [100, 1200], d: [100, 900] }, custom: [400, 400, 300], factor: 1.1 },
    vbank:     { dims: ['width', 'height', 'depth'],         limits: { w: [100, 1200], h: [100, 1200], d: [100, 900] }, custom: [400, 400, 250], factor: 1.2 }
  };

  /* Ready-made models. sizes = standard sizes [W,H,D] in mm. The first one is the default.
     The last entry is the free-form "Custom" model. */
  var MODELS = [
    { id: 'panel',     shape: 'panel',     classes: ['G4', 'M5', 'F7', 'F9'],        cls: 'F7',  frame: '#B8C1C7',
      sizes: [[592, 592, 48], [592, 490, 48], [592, 287, 48], [592, 592, 96]] },
    { id: 'round',     shape: 'round',     classes: ['G4', 'M5', 'F7'],              cls: 'M5',  frame: '#B8C1C7',
      sizes: [[400, 400, 50], [250, 250, 50], [315, 315, 50], [500, 500, 50], [630, 630, 50]] },
    { id: 'cartridge', shape: 'cartridge', classes: ['F7', 'F9', 'H13'],             cls: 'F9',  frame: '#38474F',
      sizes: [[320, 600, 70], [320, 800, 70], [350, 1000, 80]] },
    { id: 'pocket',    shape: 'pocket',    classes: ['M5', 'F7', 'F9'],              cls: 'F7',  frame: '#B8C1C7',
      sizes: [[592, 592, 380], [592, 592, 600], [592, 490, 380], [592, 287, 380]] },
    { id: 'vbank',     shape: 'vbank',     classes: ['F7', 'F9', 'H13'],             cls: 'F9',  frame: '#B8C1C7',
      sizes: [[592, 592, 292], [592, 592, 600], [592, 490, 292], [287, 592, 292]] },
    { id: 'custom',    shape: 'panel',     classes: ['G4', 'M5', 'F7', 'F9', 'H13'], cls: 'F7',  frame: '#B8C1C7', custom: true }
  ];

  var MEDIA_COLOR = '#EDF1F2';

  var COLORS = [
    { id: 'galv',     hex: '#B8C1C7' },
    { id: 'white',    hex: '#F1F4F5' },
    { id: 'black',    hex: '#15191C' },
    { id: 'graphite', hex: '#38474F' },
    { id: 'blue',     hex: '#2F7FD0' },
    { id: 'green',    hex: '#3FA66B' },
    { id: 'yellow',   hex: '#E3B93C' },
    { id: 'red',      hex: '#D1493F' }
  ];

  var MEDIA_COLORS = [
    { id: 'white', hex: '#EDF1F2' },
    { id: 'sand',  hex: '#E7DCC3' },
    { id: 'green', hex: '#9BC9A5' },
    { id: 'blue',  hex: '#9CC3E6' },
    { id: 'grey',  hex: '#9AA3A8' },
    { id: 'black', hex: '#2A2F33' }
  ];

  /* Frame materials: surface look in the viewer + price per metre of frame. */
  var FRAME_MATERIALS = {
    steel:     { metal: 0.85, rough: 0.38, rate: 2.4 },
    aluminium: { metal: 0.95, rough: 0.22, rate: 3.6 },
    plastic:   { metal: 0.0,  rough: 0.42, rate: 1.8 },
    cardboard: { metal: 0.0,  rough: 0.92, rate: 0.9 }
  };

  /* Pleat spacing in mm (distance between two neighbouring ridges). */
  var PLEATS = { coarse: 14, standard: 10, fine: 7 };

  var CUSTOM_SETUP_FEE = 3.0;                       // EUR, once per custom line
  var QTY_DISCOUNTS = [[100, 0.14], [25, 0.10], [10, 0.07], [5, 0.04]];

  function pocketCount(w) { return clamp(Math.round(w / 95), 3, 8); }
  function vCount(w) { return clamp(Math.round(w / 150), 2, 5); }

  /* Filter media area in m² for the given shape and size (mm). */
  function mediaArea(shape, w, h, d, pitch) {
    var m = 0;
    if (shape === 'panel') {
      m = (w * h) * (1 + 2 * d / pitch);
    } else if (shape === 'round') {
      var r = w / 2;
      m = Math.PI * r * r * 0.95 * (1 + 2 * d / pitch);
    } else if (shape === 'cartridge') {
      m = Math.PI * w * h * (1 + 1.2 * (0.9 * d) / pitch);
    } else if (shape === 'pocket') {
      var n = pocketCount(w), wb = w / n;
      m = n * 2 * Math.sqrt(d * d + (wb / 2) * (wb / 2)) * h;
    } else if (shape === 'vbank') {
      var k = vCount(w), wv = w / k;
      m = k * 2 * Math.sqrt(d * d + (wv / 2) * (wv / 2)) * h * (1 + 2 * 25 / pitch);
    }
    return m / 1e6;
  }

  /* Frame length in metres. */
  function perimeter(shape, w, h) {
    if (shape === 'round') return Math.PI * w / 1000;
    if (shape === 'cartridge') return 2 * Math.PI * w / 1000;
    return 2 * (w + h) / 1000;
  }

  /* Net price of one filter, EUR. cfg = {shape, w, h, d, cls, frameMat, pleat, custom} */
  function unitPrice(cfg) {
    var shape = SHAPES[cfg.shape] || SHAPES.panel;
    var pitch = PLEATS[cfg.pleat] || PLEATS.standard;
    var area = mediaArea(cfg.shape, cfg.w, cfg.h, cfg.d, pitch);
    var cls = CLASSES[cfg.cls] || CLASSES.F7;
    var mat = FRAME_MATERIALS[cfg.frameMat] || FRAME_MATERIALS.steel;
    var media = area * cls.rate * shape.factor;
    var frame = perimeter(cfg.shape, cfg.w, cfg.h) * mat.rate;
    var setup = cfg.custom ? CUSTOM_SETUP_FEE : 0;
    return { media: round2(media), frame: round2(frame), setup: setup, unit: round2(media + frame + setup), area: area };
  }

  function discountRate(qty) {
    for (var i = 0; i < QTY_DISCOUNTS.length; i++) if (qty >= QTY_DISCOUNTS[i][0]) return QTY_DISCOUNTS[i][1];
    return 0;
  }

  /* Whole-order estimate. opts = {delivery:'courier'|'pickup', payment:'card'|'bank'|'cod'|'pickup'} */
  function quote(cfg, qty, opts, settings) {
    settings = settings || {};
    opts = opts || {};
    var vatRate = settings.vatRate != null ? settings.vatRate : 0.2;
    var deliveryFee = settings.deliveryFee != null ? settings.deliveryFee : 4.9;
    var freeFrom = settings.freeDeliveryFrom != null ? settings.freeDeliveryFrom : 100;
    var codFee = settings.codFee != null ? settings.codFee : 1.5;
    qty = clamp(Math.round(qty) || 1, 1, settings.maxQty || 500);

    var u = unitPrice(cfg);
    var gross = round2(u.unit * qty);
    var dRate = discountRate(qty);
    var discount = round2(gross * dRate);
    var net = round2(gross - discount);
    var delivery = 0;
    if (opts.delivery === 'courier') delivery = net >= freeFrom ? 0 : deliveryFee;
    var cod = opts.payment === 'cod' ? codFee : 0;
    var taxable = round2(net + delivery + cod);
    var vat = round2(taxable * vatRate);
    return {
      unit: u.unit, parts: u, qty: qty,
      subtotal: gross, discountRate: dRate, discount: discount, net: net,
      delivery: delivery, cod: cod, vatRate: vatRate, vat: vat,
      total: round2(taxable + vat)
    };
  }

  var api = {
    CLASSES: CLASSES, SHAPES: SHAPES, MODELS: MODELS, COLORS: COLORS, MEDIA_COLOR: MEDIA_COLOR, MEDIA_COLORS: MEDIA_COLORS,
    FRAME_MATERIALS: FRAME_MATERIALS, PLEATS: PLEATS, QTY_DISCOUNTS: QTY_DISCOUNTS,
    pocketCount: pocketCount, vCount: vCount, mediaArea: mediaArea, perimeter: perimeter,
    unitPrice: unitPrice, discountRate: discountRate, quote: quote, clamp: clamp
  };
  root.SorsCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
