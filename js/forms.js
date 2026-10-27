/* forms.js — validators, inline error handling, card helpers and the contact form (AJAX → SorsApi.sendContact). */
(function (root, $) {
  'use strict';

  var I = root.SorsI18n, API = root.SorsApi;
  function t(k, v) { return I.t(k, v); }

  /* ───────────── validators ───────────── */
  var V = {
    email: function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s).trim()); },
    phone: function (s) {
      s = String(s).trim();
      var digits = s.replace(/\D/g, '');
      return /^[+\d][\d\s().\-\/]*$/.test(s) && digits.length >= 6 && digits.length <= 15;
    },
    /* Accepts "9", "9.5", "9,5". Returns NaN for anything else. */
    number: function (s) {
      s = String(s).trim().replace(',', '.');
      return /^\d+(\.\d*)?$|^\.\d+$/.test(s) ? parseFloat(s) : NaN;
    },
    digits: function (s) { return String(s).replace(/\D/g, ''); },
    luhn: function (num) {
      var d = V.digits(num), sum = 0, alt = false;
      if (d.length < 12) return false;
      for (var i = d.length - 1; i >= 0; i--) {
        var n = d.charCodeAt(i) - 48;
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        sum += n; alt = !alt;
      }
      return sum % 10 === 0;
    },
    cardBrand: function (num) {
      var d = V.digits(num);
      if (/^4/.test(d)) return 'VISA';
      if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'MASTERCARD';
      if (/^3[47]/.test(d)) return 'AMEX';
      if (/^(6011|65|64[4-9])/.test(d)) return 'DISCOVER';
      return '';
    },
    cardLength: function (num) { return V.cardBrand(num) === 'AMEX' ? 15 : 16; },
    formatCard: function (num) {
      var d = V.digits(num), amex = V.cardBrand(d) === 'AMEX';
      d = d.slice(0, amex ? 15 : 19);
      return (amex ? d.replace(/^(\d{1,4})(\d{1,6})?(\d{1,5})?.*$/, function (m, a, b, c) { return [a, b, c].filter(Boolean).join(' '); })
                   : d.replace(/(\d{4})(?=\d)/g, '$1 '));
    },
    /* "1228", "12/28" → { m: 12, y: 2028 } or null when it is not a date in the future. */
    expiry: function (s) {
      var d = V.digits(s);
      if (d.length < 4) return null;
      var m = parseInt(d.slice(0, 2), 10), y = 2000 + parseInt(d.slice(2, 4), 10);
      if (m < 1 || m > 12) return null;
      var now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1;
      if (y < cy || (y === cy && m < cm) || y > cy + 20) return null;
      return { m: m, y: y };
    },
    formatExpiry: function (s) {
      var d = V.digits(s).slice(0, 4);
      if (d.length === 1 && parseInt(d, 10) > 1) d = '0' + d;
      return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
    }
  };

  /* ───────────── inline errors (re-translated on language change) ───────────── */
  function setError($input, key, vars) {
    var $fb = $input.closest('.form-floating, .form-check, .dim-field').find('.invalid-feedback').first();
    if (!$fb.length) $fb = $input.siblings('.invalid-feedback').first();
    $input.addClass('is-invalid').attr('aria-invalid', 'true');
    $fb.data('err', { key: key, vars: vars || null, raw: null }).text(t(key, vars));
    if ($fb.length) {
      if (!$fb.attr('id')) $fb.attr('id', 'fb-' + ($input.attr('id') || Math.random().toString(36).slice(2)));
      $input.attr('aria-describedby', $fb.attr('id'));
    }
  }
  function setRawError($input, text) {
    setError($input, 'err.required');
    var $fb = $input.closest('.form-floating, .form-check, .dim-field').find('.invalid-feedback').first();
    $fb.data('err', { raw: text }).text(text);
  }
  function clearError($input) {
    var $fb = $input.closest('.form-floating, .form-check, .dim-field').find('.invalid-feedback').first();
    $input.removeClass('is-invalid').removeAttr('aria-invalid').removeAttr('aria-describedby');
    $fb.removeData('err').text('');
  }
  function clearAll($scope) {
    $scope.find('.is-invalid').each(function () { clearError($(this)); });
  }
  function refreshErrors() {
    $('.invalid-feedback').each(function () {
      var e = $(this).data('err');
      if (e && e.key) $(this).text(t(e.key, e.vars));
    });
  }
  $(document).on('sors:lang', refreshErrors);

  function showAlert($el, text, kind) {
    $el.removeClass('is-error is-ok is-shake').addClass(kind === 'ok' ? 'is-ok' : 'is-error').text(text).prop('hidden', false);
    void $el[0].offsetWidth;
    $el.addClass('is-shake');
  }
  function hideAlert($el) { $el.prop('hidden', true).text(''); }

  /* Turn an API failure object into a readable message. */
  function failText(err) {
    if (!err) return t('err.server');
    if (err.kind === 'network') return t('err.network');
    if (err.kind === 'timeout') return t('err.timeout');
    return err.message || t('err.server');
  }

  /* Map server-side { "customer.email": "msg" } onto inputs by their name attribute (last segment of the key).
     Payload names that differ from the input names are listed here. Returns the first matched input. */
  var ALIAS = { postCode: 'post', vatId: 'vat', holder: 'cardHolder', number: 'cardNumber', expMonth: 'cardExp', expYear: 'cardExp', cvc: 'cardCvc' };
  function applyServerErrors($scope, errors) {
    var first = null;
    if (!errors) return null;
    Object.keys(errors).forEach(function (key) {
      var name = key.split('.').pop();
      name = ALIAS[name] || name;
      var $in = $scope.find('[name="' + name + '"]').first();
      if (!$in.length) return;
      setRawError($in, String(Array.isArray(errors[key]) ? errors[key][0] : errors[key]));
      if (!first) first = $in;
    });
    return first;
  }

  function busy($btn, on, labelKey) {
    $btn.toggleClass('is-busy', !!on).prop('disabled', !!on);
    if (labelKey) {
      var $s = $btn.find('[data-i18n]').first();
      if (on) { $s.data('prev', $s.attr('data-i18n')).attr('data-i18n', labelKey).text(t(labelKey)); }
      else if ($s.data('prev')) { $s.attr('data-i18n', $s.data('prev')).text(t($s.data('prev'))); }
    }
  }

  /* ───────────── contact form ───────────── */
  function initContact() {
    var $form = $('#contactForm');
    if (!$form.length) return;
    var $alert = $('#contactAlert'), $btn = $('#contactSend'), $ok = $('#contactOk');

    function validate() {
      var ok = true, first = null;
      function bad($in, key) { setError($in, key); ok = false; if (!first) first = $in; }
      clearAll($form);
      var $n = $('#cName'), $e = $('#cEmail'), $p = $('#cPhone'), $m = $('#cMessage'), $c = $('#cConsent');
      if (!$.trim($n.val())) bad($n, 'err.required');
      if (!$.trim($e.val())) bad($e, 'err.required'); else if (!V.email($e.val())) bad($e, 'err.email');
      if ($.trim($p.val()) && !V.phone($p.val())) bad($p, 'err.phone');
      if (!$.trim($m.val())) bad($m, 'err.required');
      if (!$c.is(':checked')) bad($c, 'err.terms');
      if (first) first.trigger('focus');
      return ok;
    }

    // clear a field's error while the person types (not on blur: the layout shift would swallow the next click)
    $form.on('input', '.is-invalid', function () {
      var $in = $(this);
      if ($.trim($in.val())) clearError($in);
    });
    $form.on('change', '#cConsent', function () { if (this.checked) clearError($(this)); });

    $form.on('submit', function (e) {
      e.preventDefault();
      hideAlert($alert);
      if (!validate()) { showAlert($alert, t('err.fix')); return; }
      var data = {
        name: $.trim($('#cName').val()), email: $.trim($('#cEmail').val()), phone: $.trim($('#cPhone').val()),
        topic: $('#cTopic').val(), message: $.trim($('#cMessage').val()), consent: true,
        website: $form.find('[name="website"]').val() || '', lang: I.lang
      };
      busy($btn, true, 'contact.sending');
      API.sendContact(data).done(function () {
        busy($btn, false, 'contact.sending');
        $form[0].reset();
        $form.prop('hidden', true);
        $ok.prop('hidden', false).trigger('focus');
      }).fail(function (err) {
        busy($btn, false, 'contact.sending');
        var first = applyServerErrors($form, err && err.errors);
        showAlert($alert, first ? t('err.fix') : failText(err));
        if (first) first.trigger('focus');
      });
    });

    $('#contactAnother').on('click', function () {
      $ok.prop('hidden', true);
      $form.prop('hidden', false);
      clearAll($form);
      $('#cName').trigger('focus');
    });
  }

  root.SorsForms = {
    V: V, setError: setError, setRawError: setRawError, clearError: clearError, clearAll: clearAll,
    showAlert: showAlert, hideAlert: hideAlert, failText: failText, applyServerErrors: applyServerErrors, busy: busy,
    refreshErrors: refreshErrors
  };

  $(initContact);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SorsForms;
})(window, window.jQuery);
