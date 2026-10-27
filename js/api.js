/* api.js — every request the site makes to the back-end lives here.
   Base URL and endpoint paths come from SORS_CONFIG.api (config.js).

   ── Contract (all JSON, UTF-8; the site sends the page language in the Accept-Language header) ──

   POST {base}contact
     body    { name, email, phone, topic, message, consent: true, website: "" , lang }   (website = honeypot, must be empty)
     200/201 { ok: true, id?: "..." }
     4xx     { ok: false, message?: "...", errors?: { fieldName: "message" } }

   POST {base}orders        (header Idempotency-Key = body.reference; a retry of the same order repeats the same key, answer it with the first result)
     body    { reference: "<client uuid>", lang, currency, customer: { type: "person"|"company", firstName, lastName,
               email, phone, company?, vatId? }, delivery: { method: "courier"|"pickup", country, city, postCode, address, note? },
               items: [ { model, shape, widthMm, heightMm, depthMm, filterClass, frameColor, mediaColor, frameMaterial,
                          pleatDensity, quantity, custom } ], payment: { method: "card"|"bank"|"cod"|"pickup" },
               estimate: { net, delivery, vat, total } }
     201     { orderId: "...", number: "SH-1042", totals: { net, delivery, vat, total, currency }, payment?: { ... } }
     4xx     { message?, errors?: { "customer.email": "..." } }
     Sizes by shape (millimetres): panel / pocket / vbank → widthMm × heightMm × depthMm (depth = frame thickness or pocket length);
             round → widthMm = diameter, depthMm = thickness (heightMm repeats the diameter);
             cartridge → widthMm = outer diameter, heightMm = length, depthMm = pleat depth.
     estimate is only what the visitor saw on screen: price the order again on the server.

   POST {base}orders/{orderId}/payment
     body    { method: "card"|"bank"|"cod"|"pickup", card?: { holder, number, expMonth, expYear, cvc } }
             (card only when method = "card" — the card data is sent to YOUR server over HTTPS, so PCI-DSS applies there)
     200     { status: "paid"|"pending"|"requires_action"|"failed", redirectUrl?: "https://...", instructions?: { iban, bic, beneficiary, reference },
               message? }
     requires_action + redirectUrl → the site redirects the browser there (3-D Secure step).

   Error fields: keys in "errors" are matched to form inputs by their last segment, e.g. "customer.email" → email.
     Contact: name, email, phone, topic, message, consent.  Order: firstName, lastName, email, phone, company, vatId, country, city,
     postCode, address, note, and the card fields holder, number, expMonth (or expYear), cvc.  A value may be a string or an array (first item shown).

   CORS: the requests are JSON with custom headers, so the browser sends an OPTIONS preflight first. The server must answer it and allow
   the origin that hosts this site, methods POST + OPTIONS, and headers Content-Type, Accept-Language, Idempotency-Key.
   Try the whole front-end without a server: open index.html?mock=1 (or set api.mock = true in config.js).
*/
(function (root, $) {
  'use strict';
  var cfg = root.SORS_CONFIG || {};
  var apiCfg = cfg.api || {};

  function isMock() { return !!apiCfg.mock || /[?&]mock=1\b/.test(root.location ? root.location.search : ''); }

  function url(endpointKey, params) {
    var path = (apiCfg.endpoints || {})[endpointKey] || endpointKey;
    if (params) path = path.replace(/\{(\w+)\}/g, function (m, k) { return encodeURIComponent(params[k]); });
    return String(apiCfg.base || '/api/').replace(/\/?$/, '/') + path.replace(/^\//, '');
  }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /* Normalised failure object: { status, message, errors } */
  function fail(jqXHR, textStatus) {
    var body = null;
    try { body = jqXHR.responseJSON || JSON.parse(jqXHR.responseText); } catch (e) {}
    var kind = textStatus === 'timeout' ? 'timeout' : (jqXHR.status === 0 ? 'network' : 'server');
    return {
      status: jqXHR.status || 0, kind: kind,
      message: body && body.message ? body.message : '',
      errors: body && body.errors ? body.errors : null
    };
  }

  function request(method, endpointKey, data, params, headers) {
    var d = $.Deferred();
    if (isMock()) {
      setTimeout(function () { d.resolve(mock(endpointKey, data)); }, 900 + Math.random() * 600);
      return d.promise();
    }
    $.ajax({
      url: url(endpointKey, params),
      method: method,
      contentType: 'application/json; charset=UTF-8',
      dataType: 'json',
      data: JSON.stringify(data),
      timeout: apiCfg.timeout || 20000,
      headers: $.extend({ 'Accept-Language': root.SorsI18n ? root.SorsI18n.lang : 'en' }, headers || {})
    }).done(function (res) { d.resolve(res || {}); })
      .fail(function (jqXHR, textStatus) { d.reject(fail(jqXHR, textStatus)); });
    return d.promise();
  }

  /* Fake answers for developing the front-end without a back-end (?mock=1). */
  function mock(key, data) {
    if (key === 'contact') return { ok: true, id: 'mock-' + Date.now() };
    if (key === 'createOrder') {
      var e = data.estimate || {};
      return { orderId: 'mock-' + Date.now(), number: 'SH-' + (1000 + Math.floor(Math.random() * 900)),
        totals: { net: e.net, delivery: e.delivery, vat: e.vat, total: e.total, currency: data.currency } };
    }
    if (key === 'pay') {
      var m = data.method;
      if (m === 'bank') return { status: 'pending', instructions: { beneficiary: 'Sors HVAC', iban: 'BG00 XXXX 0000 0000 0000 00', bic: 'XXXXBGSF', reference: 'SH-' + Date.now().toString().slice(-6) } };
      if (m === 'card') return { status: 'paid' };
      return { status: 'pending' };
    }
    return {};
  }

  root.SorsApi = {
    isMock: isMock,
    newReference: uuid,
    sendContact: function (payload) { return request('POST', 'contact', payload); },
    createOrder: function (payload) {
      return request('POST', 'createOrder', payload, null, { 'Idempotency-Key': payload.reference });
    },
    payOrder: function (orderId, payload) {
      return request('POST', 'pay', payload, { orderId: orderId });
    },
    _url: url
  };
})(window, window.jQuery);
