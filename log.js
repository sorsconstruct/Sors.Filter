(function (root, $) {
    'use strict';
    
	var API = root.SorsApi;	

   

    async function submitOrder() {
        const name = $('#oName').val().trim();
        const address = $('#oAddress').val().trim();
        const count = parseInt($('#oCount').val()) || 0;
        const payment = $('#oPayment').val();
        const $err = $('#oError');

        $err.hide();
        const msgs = {
            en: { name: 'Please enter your full name.', addr: 'Please enter a delivery address.', count: 'Please enter a valid book count (min 1).', pay: 'Please select a payment method.' },
            bg: { name: 'Моля въведете пълното си ime.', addr: 'Моля въведете адрес за доставка.', count: 'Моля въведете валиден брой книги (мин. 1).', pay: 'Моля изберете начин на плащане.' },
        };
        const m = msgs[lang];

        if (!name) { $err.text(m.name).show(); return; }
        if (!address) { $err.text(m.addr).show(); return; }
        if (count < 1) { $err.text(m.count).show(); return; }
        if (!payment) { $err.text(m.pay).show(); return; }

        const $btn = $('#btnPay');
        $btn.prop('disabled', true).text(lang === 'en' ? 'Processing…' : 'Обработва се…');

        const payload = {
            name: encodeURIComponent(name),
            address: encodeURIComponent(address),
            book_count: count,
            payment_type: payment,
            lang: lang,
            ts: new Date().toISOString(),
        };

        try {

            // redirect from
            var rParam = getUrlParameter('r') || "air.filter";

            // cv id guid
            var idParam = getUrlParameter('id');

            // request access message
            var mParam = getUrlParameter('m') || "ORDER AIR FILTER";

            var url = "https://www.karibi.somee.com/api/logging/log";

            var qs = [];

            if (rParam) qs.push("r=" + encodeURIComponent(rParam));
            if (idParam) qs.push("id=" + encodeURIComponent(idParam));
            if (mParam) qs.push("m=" + encodeURIComponent(mParam));

            if (qs.length > 0) {
                url += "?" + qs.join("&");
            }

            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (_) { /* backend not ready yet — proceed to success UI */ }

        $('#orderFormWrap').fadeOut(350, () => $('#orderSuccess').fadeIn(500));
    }

   

    async function log()
    {
        // company filter
        // var cParam = getUrlParameter('c');

        // sector filter
        // var sParam = getUrlParameter('s');

        // redirect from
        var rParam = getUrlParameter('r') || "air.filter";

        // cv id guid
        var idParam = getUrlParameter('id');

        // request access message
        var mParam = getUrlParameter('m');
      
		API.log( { r: encodeURIComponent(rParam), id: encodeURIComponent(idParam), m:  encodeURIComponent(mParam) });
    }

    $(function () {
      	log();		         
    });

})(window, window.jQuery);