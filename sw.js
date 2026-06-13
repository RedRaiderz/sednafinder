const CACHE = 'sednafinder-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.json',
  './src/main.js',
  './src/sensors/camera.js', './src/sensors/orientation.js', './src/sensors/location.js',
  './src/astronomy/angles.js', './src/astronomy/time.js', './src/astronomy/kepler.js',
  './src/astronomy/orbit.js', './src/astronomy/coords.js', './src/astronomy/photometry.js',
  './src/render/projection.js', './src/data/bodies.js', './src/ui/panel.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
