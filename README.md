# Sors HVAC: air filter site (front-end only)

Static site: HTML + CSS + jQuery + Bootstrap 5, no build step. Open `index.html` (or serve the folder with any static server).
jQuery, Bootstrap, Google Fonts and the map library load from CDNs, so the page needs internet access.

## Configure

Everything you will want to change is in `js/config.js`:

| What | Where |
| --- | --- |
| API base URL (`https://karibi.com/api/`) and endpoint paths | `api.base`, `api.endpoints` |
| Company name, address, phone, e-mail, opening hours, map coordinates | `company`, `map` |
| Currency, VAT, delivery fee, free-delivery threshold, COD fee | `currency`, `vatRate`, `deliveryFee`, … |
| Terms / privacy links | `legal` |

Prices and the model list live in `js/catalog.js`. Texts are in `js/lang-en.js` and `js/lang-bg.js` (keep the keys identical).
The phone number, e-mail, prices and VAT rate are placeholders.

## Back-end contract

Every request is made from `js/api.js`; the full contract (bodies, responses, error format) is documented at the top of that file.

| Call | Purpose |
| --- | --- |
| `POST {base}contact` | contact form |
| `POST {base}orders` | create the order (header `Idempotency-Key` = `body.reference`) |
| `POST {base}orders/{orderId}/payment` | pay: card details, bank transfer, cash on delivery or pickup |

- Run the whole site without a server: `index.html?mock=1`.
- The browser sends an `OPTIONS` preflight, so the server must allow your site's origin, methods `POST, OPTIONS` and headers `Content-Type, Accept-Language, Idempotency-Key`.
- The card form posts the card data to your API. Serve everything over HTTPS and treat the payment endpoint as PCI-DSS scope (or swap the card step for a hosted payment page).
- The `estimate` sent with an order is only what the visitor saw: price the order again on the server.

## Files

```
index.html          page markup
css/styles.css      theme, hero, sections       css/order.css    3D stage + order wizard
css/contact.css     contact form + map card
js/config.js        settings                    js/catalog.js    models, classes, colours, prices
js/api.js           all AJAX calls              js/forms.js      validation + contact form
js/i18n.js          EN/BG engine                js/lang-*.js     texts
js/gl-core.js       WebGL helpers               js/filter-geo.js filter geometry (5 shapes)
js/filter-flow.js   airflow particles           js/viewer*.js    the 3D filter viewer
js/order-core.js    configurator (live 3D)      js/order-flow.js 4-step wizard + payment
js/map3d.js         3D map (MapLibre + OpenFreeMap, no key)      js/app.js  hero, nav, reveals
```

The 3D filter is plain WebGL (no Three.js). Without WebGL the configurator still works and shows a notice instead of the preview;
if the 3D map cannot load, a flat OpenStreetMap embed is shown.
