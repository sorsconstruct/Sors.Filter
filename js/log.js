(function (root, $) {
    'use strict';
    
	var API = root.SorsApi;	

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
