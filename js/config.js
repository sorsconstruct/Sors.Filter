/* config.js — the only file you normally need to edit to wire the site to your back-end.
   Everything here is a placeholder until you replace it with real company data. */
window.SORS_CONFIG = {
  brand: { name: 'Sors HVAC' },

  api: {
    base: 'https://karibi.com/api/',
    endpoints: {
      contact: 'contact',                     // POST  → send the contact form
      createOrder: 'orders',                  // POST  → create an order, returns orderId
      pay: 'orders/{orderId}/payment'         // POST  → pay / start payment for that order
    },
    timeout: 20000,
    // true = no network calls, fake answers after a short delay. Also switchable with ?mock=1 in the URL.
    mock: false
  },
  company: {
    streetEn: 'Mihail Doichev #21 Street',
    streetBg: 'ул. „Михаил Дойчев №21“',
    cityEn: 'Byala, Varna, Bulgaria, 9101',
    cityBg: 'гр. Бяла, обл. Варна, 9101',
    phone: '+359 000 000 000',
    email: 'z.vmw@abv.bg',
    hoursEn: 'Mon–Fri 08:00–17:00',
    hoursBg: 'Пон–Пет 08:00–17:00',
    // [longitude, latitude] — approximate centre of Byala. Put the exact point of the factory here.
    coords: [27.887577,42.883705]
  },
  
  company2: {
    streetEn: 'N. Canov Street',
    streetBg: 'ул. „Н. Цанов“',
    cityEn: 'Byala, Varna, Bulgaria',
    cityBg: 'гр. Бяла, обл. Варна',
    phone: '+359 000 000 000',
    email: 'info@karibi.com',
    hoursEn: 'Mon–Fri 08:00–17:00',
    hoursBg: 'Пон–Пет 08:00–17:00',
    // [longitude, latitude] — approximate centre of Byala. Put the exact point of the factory here.
    coords: [27.8833, 42.8667]
  },

  map: {
    // Free vector tiles, no key needed (https://openfreemap.org). Styles: liberty (3D buildings), bright, positron.
    style: 'https://tiles.openfreemap.org/styles/liberty',
    zoom: 16.4,
    pitch: 62,
    bearing: -24
  },

  currency: 'EUR',
  vatRate: 0.20,
  freeDeliveryFrom: 100,     // net order value (EUR) from which courier delivery is free
  deliveryFee: 4.9,          // courier delivery, EUR
  codFee: 1.5,               // cash-on-delivery surcharge, EUR
  maxQty: 500,

  legal: { terms: '#', privacy: '#' }
};
