// Offline support. Everything is precached on install; the page and code are served
// network-first (so updates land on the next open) and fall back to cache offline.
const VERSION = 'sf-v2.0.0';
const ASSETS = ['./', './data/constellations.json', './data/dso.json', './data/stars.json', './fonts/fonts.css', './fonts/newsreader-italic-var.woff2', './fonts/newsreader-var.woff2', './fonts/plexmono-400.woff2', './fonts/plexmono-500.woff2', './fonts/plexsans-var.woff2', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './index.html', './manifest.json', './src/astronomy/angles.js', './src/astronomy/coords.js', './src/astronomy/kepler.js', './src/astronomy/orbit.js', './src/astronomy/photometry.js', './src/astronomy/time.js', './src/data/bodies.js', './src/data/facts.js', './src/main.js', './src/sensors/camera.js', './src/sensors/location.js', './src/sensors/orientation.js', './src/sky/model.js', './src/sky/render.js', './src/sky/sats.js', './src/sky/view.js', './src/ui/detail.js', './src/ui/find.js', './src/ui/format.js', './src/ui/tonight.js', './styles.css', './vendor/astronomy.js', './vendor/satellite.min.js', ];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // TLEs etc. go straight to the network
  e.respondWith((async () => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    });
    // Out under the sky with one bar of signal: don't wait more than 2.5 s for the network.
    const timeout = new Promise((r) => setTimeout(r, 2500));
    try {
      const res = await Promise.race([net, timeout]);
      if (res) return res;
    } catch { /* offline */ }
    const hit = await caches.match(e.request, { ignoreSearch: true });
    return hit || net;
  })());
});
