/* order-flow.js — the four-step wizard: validation, delivery/payment options, card form and the API calls
   (SorsApi.createOrder → SorsApi.payOrder). The back-end contract is documented at the top of api.js. */
(function (root, $) {
  'use strict';

  var O = root.SorsOrder;
  if (!O) return;
  var I = root.SorsI18n, CFG = root.SORS_CONFIG, API = root.SorsApi, F = root.SorsForms, Vd = F.V, S = O.state;
  function t(k, v) { return I.t(k, v); }
  function money(v) { return I.money(v, CFG.currency); }
  function val(id) { return $.trim($('#' + id).val()); }

  var step = 1, maxStep = 1, busyNow = false;
  var order = { id: null, number: null, sig: null, reference: null };
  var $form, $alert;

  function $pane(n) { return $('.step-pane[data-step="' + n + '"]'); }

  /* ───────────── navigation ───────────── */
  function goTo(n, instant) {
    n = Math.max(1, Math.min(4, n));
    var prev = step;
    step = n; maxStep = Math.max(maxStep, n);

    $('.step-pane').prop('hidden', true).removeClass('is-entering is-entering-back');
    var $p = $pane(n).prop('hidden', false);
    if (!instant && n !== prev) $p.addClass(n > prev ? 'is-entering' : 'is-entering-back');

    $('.ruler-btn').each(function () {
      var k = +$(this).data('go');
      $(this).toggleClass('is-current', k === n).toggleClass('is-done', k < n)
        .prop('disabled', k > maxStep).attr('aria-current', k === n ? 'step' : null);
    });
    $('#rulerFill').css('width', (n / 4 * 100) + '%');
    $('#btnBack').prop('hidden', n === 1);
    $('#btnNext').prop('hidden', n === 4);
    $('#btnPlace').prop('hidden', n !== 4);
    $('#stepLive').text(t('step.of', { n: n, total: 4 }));
    F.hideAlert($alert);

    if (n === 3) syncDelivery();
    if (n === 4) { syncDelivery(); syncPayment(); }

    if (!instant && n !== prev) {
      var off = root.innerWidth < 992 ? ($('.order-stage').outerHeight() || 0) + 84 : 96;
      var top = $('#ruler').offset().top - off;
      if ($(root).scrollTop() > top) root.scrollTo({ top: top, behavior: 'smooth' });
      $p.find('.step-title').attr('tabindex', -1)[0].focus({ preventScroll: true });
    }
  }

  function next() { if (validate(step)) goTo(step + 1); }

  /* ───────────── validation ───────────── */
  function validate(n, silent) {
    var ok = true, first = null;
    function bad($in, key, vars) { F.setError($in, key, vars); ok = false; if (!first) first = $in; }
    function need(id) { var $in = $('#' + id); if (!$.trim($in.val())) bad($in, 'err.required'); }

    if (n === 1) {
      if (!O.validateDims()) { ok = false; first = $('#dimInputs .is-invalid').first(); }
    } else if (n === 3) {
      F.clearAll($pane(3));
      need('firstName'); need('lastName');
      if (!val('email')) bad($('#email'), 'err.required'); else if (!Vd.email(val('email'))) bad($('#email'), 'err.email');
      if (!val('phone')) bad($('#phone'), 'err.required'); else if (!Vd.phone(val('phone'))) bad($('#phone'), 'err.phone');
      if ($('input[name=type]:checked').val() === 'company') need('company');
      if (S.delivery === 'courier') { need('city'); need('post'); need('address'); }
    } else if (n === 4) {
      F.clearAll($pane(4));
      if (S.payment === 'card') {
        need('cardHolder');
        var num = $('#cardNumber').val();
        if (!Vd.digits(num)) bad($('#cardNumber'), 'err.required');
        else if (!Vd.luhn(num) || Vd.digits(num).length < Vd.cardLength(num)) bad($('#cardNumber'), 'err.cardNumber');
        if (!Vd.expiry($('#cardExp').val())) bad($('#cardExp'), 'err.cardExp');
        if (!/^\d{3,4}$/.test($('#cardCvc').val())) bad($('#cardCvc'), 'err.cardCvc');
      }
      if (!$('#terms').is(':checked')) bad($('#terms'), 'err.terms');
    }
    if (!ok && !silent) { F.showAlert($alert, t('err.fix')); if (first && first.length) first.trigger('focus'); }
    return ok;
  }

  /* ───────────── delivery and payment options ───────────── */
  function syncDelivery() {
    S.delivery = $('input[name=delivery]:checked').val() || 'courier';
    $('#addrWrap').prop('hidden', S.delivery !== 'courier');
    $('.tile[data-pay=cod]').prop('hidden', S.delivery !== 'courier');
    $('.tile[data-pay=pickup]').prop('hidden', S.delivery !== 'pickup');
    var cur = $('input[name=payment]:checked');
    if (!cur.length || cur.closest('.tile').prop('hidden')) $('input[name=payment][value=card]').prop('checked', true);
    $('#courierNote').text(t('delivery.courierNote', { amount: money(CFG.freeDeliveryFrom), fee: money(CFG.deliveryFee) }));
    S.payment = $('input[name=payment]:checked').val() || 'card';
    O.updatePrice();
  }

  function syncPayment() {
    S.payment = $('input[name=payment]:checked').val() || 'card';
    $('#cardPanel').prop('hidden', S.payment !== 'card');
    var key = { bank: 'pay.bankNote', cod: 'pay.codNote', pickup: 'pay.pickupNote' }[S.payment];
    $('#payNote').prop('hidden', !key).text(key ? t(key, { fee: money(CFG.codFee) }) : '');
    O.updatePrice();
  }

  /* ───────────── card form ───────────── */
  function reformat($in, fmt) {
    var el = $in[0], pos = el.selectionStart, active = document.activeElement === el;
    var digitsBefore = el.value.slice(0, pos == null ? el.value.length : pos).replace(/\D/g, '').length;
    el.value = fmt(el.value);
    if (!active) return;
    var p = 0, c = 0;
    while (p < el.value.length && c < digitsBefore) { if (/\d/.test(el.value.charAt(p))) c++; p++; }
    try { el.setSelectionRange(p, p); } catch (e) {}
  }

  function cardPreview() {
    var raw = Vd.digits($('#cardNumber').val()), brand = Vd.cardBrand(raw), amex = brand === 'AMEX';
    var pad = (raw + new Array(17).join('•')).slice(0, amex ? 15 : 16);
    $('#cardPreviewNum').text(amex ? pad.slice(0, 4) + ' ' + pad.slice(4, 10) + ' ' + pad.slice(10) : pad.replace(/(.{4})(?=.)/g, '$1 '));
    $('#cardBrand').text(brand === 'MASTERCARD' ? 'MASTERCARD' : brand);
    $('#cardPreviewName').text($.trim($('#cardHolder').val()).toUpperCase() || ' ');
    $('#cardPreviewExp').text($('#cardExp').val() || 'MM/YY');
  }

  function bindCard() {
    $('#cardNumber').on('input', function () {
      reformat($(this), Vd.formatCard); cardPreview();
      var n = $(this).val(), d = Vd.digits(n);
      if ($(this).hasClass('is-invalid') && d.length >= Vd.cardLength(n) && Vd.luhn(n)) F.clearError($(this));
      if (d.length === Vd.cardLength(n)) $('.card-face').removeClass('is-flip').each(function () { void this.offsetWidth; }).addClass('is-flip');
    });
    $('#cardExp').on('input', function () { reformat($(this), Vd.formatExpiry); cardPreview(); });
    $('#cardCvc').on('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); });
    $('#cardHolder').on('input', cardPreview);
  }

  /* ───────────── building the API payloads ───────────── */
  function buildOrder() {
    var q = O.quote(), type = $('input[name=type]:checked').val(), pickup = S.delivery === 'pickup';
    return {
      reference: null, lang: I.lang, currency: CFG.currency,
      customer: {
        type: type, firstName: val('firstName'), lastName: val('lastName'), email: val('email'), phone: val('phone'),
        company: type === 'company' ? val('company') : '', vatId: type === 'company' ? val('vat') : ''
      },
      delivery: {
        method: S.delivery, country: pickup ? '' : $('#country').val(), city: pickup ? '' : val('city'),
        postCode: pickup ? '' : val('post'), address: pickup ? '' : val('address'), note: val('note')
      },
      items: [{
        model: S.modelId, shape: S.shape, widthMm: S.dims.w, heightMm: S.dims.h, depthMm: S.dims.d,
        filterClass: S.cls, frameColor: S.frameColor, mediaColor: S.mediaColor, frameMaterial: S.frameMat,
        pleatDensity: S.pleat, quantity: S.qty, custom: S.custom
      }],
      payment: { method: S.payment },
      estimate: { net: q.net, delivery: q.delivery, vat: q.vat, total: q.total }
    };
  }

  function buildPayment() {
    var p = { method: S.payment };
    if (S.payment === 'card') {
      var exp = Vd.expiry($('#cardExp').val());
      p.card = { holder: val('cardHolder'), number: Vd.digits($('#cardNumber').val()), expMonth: exp.m, expYear: exp.y, cvc: $('#cardCvc').val() };
    }
    return p;
  }

  /* ───────────── placing the order ───────────── */
  function setBusy(on) {
    busyNow = on;
    F.busy($('#btnPlace'), on, 'btn.sending');
    $('#btnBack, .ruler-btn').prop('disabled', on);
    if (!on) $('.ruler-btn').each(function () { $(this).prop('disabled', +$(this).data('go') > maxStep); });
  }

  function stepOf($in) { return +($in.closest('.step-pane').data('step') || step); }

  function placeOrder() {
    if (busyNow) return;
    var s;
    for (var i = 0; i < 3; i++) {
      s = [1, 3, 4][i];
      if (!validate(s, true)) { goTo(s); validate(s); return; }
    }
    F.hideAlert($alert);

    var payload = buildOrder(), sig = JSON.stringify(payload);
    if (order.sig !== sig || !order.reference) { order.id = null; order.reference = API.newReference(); order.sig = sig; }
    payload.reference = order.reference;

    setBusy(true);
    var created = order.id ? $.Deferred().resolve({ orderId: order.id, number: order.number }).promise() : API.createOrder(payload);
    created.done(function (res) {
      order.id = res.orderId || res.id;
      order.number = res.number || res.orderNumber || order.id;
      if (!order.id) { fail({ kind: 'server', message: '' }, 'order'); return; }
      API.payOrder(order.id, buildPayment()).done(onPaid).fail(function (err) { fail(err, 'pay'); });
    }).fail(function (err) { fail(err, 'order'); });
  }

  function fail(err, phase) {
    setBusy(false);
    var first = F.applyServerErrors($form, err && err.errors);
    if (first) { goTo(stepOf(first)); F.showAlert($alert, t('err.fix')); first.trigger('focus'); return; }
    var msg;
    if (phase === 'pay') {
      if (err && (err.kind === 'network' || err.kind === 'timeout')) msg = t('err.payAfterOrder', { number: order.number });
      else msg = (err && err.message) || t('err.payFailed');
      $('#cardCvc').val('');
    } else msg = F.failText(err);
    F.showAlert($alert, msg);
  }

  function onPaid(res) {
    var status = res.status || 'pending';
    if (status === 'failed') {
      setBusy(false);
      $('#cardCvc').val('');
      F.showAlert($alert, res.message || t('err.payFailed'));
      return;
    }
    var url = res.redirectUrl;
    if (status === 'requires_action' && url && /^https:\/\//i.test(url)) {
      showDone(res, 'redirect');
      root.setTimeout(function () { root.location.href = url; }, 1400);
      return;
    }
    showDone(res, status);
  }

  function showDone(res, status) {
    setBusy(false);
    var line = '';
    if (status === 'paid') line = t('done.paid');
    else if (status === 'redirect') line = t('done.redirect');
    else if (res.instructions && S.payment === 'bank') line = t('done.bank');

    $('#doneTitle').text(t('done.title', { number: order.number }));
    $('#doneText').text(t('done.text', { email: val('email') }));
    $('#doneStatus').text(line).prop('hidden', !line);

    var ins = res.instructions, $bank = $('#doneBank').empty();
    if (ins && S.payment === 'bank') {
      [['done.beneficiary', ins.beneficiary], ['done.iban', ins.iban], ['done.bic', ins.bic], ['done.reference', ins.reference]].forEach(function (r) {
        if (r[1]) $bank.append($('<div>').append($('<dt>').text(t(r[0])), $('<dd>').text(r[1])));
      });
      $bank.prop('hidden', !$bank.children().length);
    } else $bank.prop('hidden', true);

    $('#cardNumber, #cardCvc, #cardExp, #cardHolder').val('');
    cardPreview();
    $form.prop('hidden', true);
    $('#ruler').prop('hidden', true);
    $('#orderDone').prop('hidden', false);
    $('#orderDone')[0].focus({ preventScroll: true });
    var off = root.innerWidth < 992 ? ($('.order-stage').outerHeight() || 0) + 84 : 96;
    root.scrollTo({ top: $('.order-panel').offset().top - off, behavior: 'smooth' });
  }

  function reset() {
    order = { id: null, number: null, sig: null, reference: null };
    $('#orderDone').prop('hidden', true);
    $form.prop('hidden', false);
    $('#ruler').prop('hidden', false);
    $('#terms').prop('checked', false);
    maxStep = 1;
    goTo(1, true);
  }

  /* ───────────── init ───────────── */
  function setLegalLinks() {
    $('.js-terms').attr('href', (CFG.legal && CFG.legal.terms) || '#');
    $('.js-privacy').attr('href', (CFG.legal && CFG.legal.privacy) || '#');
  }

  function init() {
    $form = $('#orderForm');
    if (!$form.length) return;
    $alert = $('#orderAlert');

    $('#btnNext').on('click', next);
    $('#btnBack').on('click', function () { goTo(step - 1); });
    $('.ruler-btn').on('click', function () {
      var k = +$(this).data('go');
      if (k === step || k > maxStep) return;
      if (k > step && !validate(step)) return;
      goTo(k);
    });
    $form.on('submit', function (e) { e.preventDefault(); if (step < 4) next(); else placeOrder(); });
    $('#btnAnother').on('click', reset);

    $('input[name=type]').on('change', function () { $('.js-company').prop('hidden', this.value !== 'company'); });
    $('input[name=delivery]').on('change', syncDelivery);
    $('input[name=payment]').on('change', syncPayment);
    // the size inputs (data-k) check themselves on every keystroke, so they are left out here
    $form.on('input', '.form-control.is-invalid:not([data-k])', function () { if ($.trim(this.value)) F.clearError($(this)); });
    $('#terms').on('change', function () { if (this.checked) F.clearError($(this)); });
    bindCard();

    $(document).on('sors:lang', function () {
      setLegalLinks(); syncDelivery(); syncPayment(); cardPreview();
      $('#stepLive').text(t('step.of', { n: step, total: 4 }));
    });

    setLegalLinks();
    goTo(1, true);
    syncDelivery(); syncPayment(); cardPreview();
  }

  O.goTo = goTo;
  $(init);
})(window, window.jQuery);
