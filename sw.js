// Offline support. Bump VERSION on every deploy: the browser sees sw.js change, installs the new
// set as one versioned cache, and the next launch runs it — so code files never mix versions.
const VERSION = 'sf-v2.4.0';
const ASSETS = ['./', './data/constellations.json', './data/dso.json', './data/stars.json', './fonts/fonts.css', './fonts/newsreader-italic-var.woff2', './fonts/newsreader-var.woff2', './fonts/plexmono-400.woff2', './fonts/plexmono-500.woff2', './fonts/plexsans-var.woff2', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './index.html', './manifest.json', './src/astronomy/angles.js', './src/astronomy/coords.js', './src/astronomy/kepler.js', './src/astronomy/orbit.js', './src/astronomy/photometry.js', './src/astronomy/time.js', './src/data/bodies.js', './src/data/facts.js', './src/main.js', './src/sensors/camera.js', './src/sensors/location.js', './src/sensors/orientation.js', './src/sensors/telemetry.js', './src/sky/model.js', './src/sky/render.js', './src/sky/sats.js', './src/sky/view.js', './src/ui/detail.js', './src/ui/find.js', './src/ui/format.js', './src/ui/tonight.js', './styles.css', './vendor/astronomy.js', './vendor/magvar.js', './vendor/satellite.min.js', ];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // TLEs etc. go straight to the network
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) cache.put(e.request, res.clone());
    return res;
  }));
});
