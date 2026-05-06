// BUG FIX #14: separate VERSION constant so you only edit one number per deploy
// ← bump this on every production release to force cache invalidation
var VERSION = '5';
var CACHE = 'posh-v' + VERSION;
var ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/firebase.js',
  '/firebase-auth.js',
  '/staff.js',
  '/quickwins.js',
  '/barcode.js',
  '/features.js',
  '/product-images.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // BUG FIX: log caching failures instead of silently swallowing them.
      // A silent catch meant a 404'd asset would install a broken offline cache,
      // causing blank screens with no console warning to diagnose the problem.
      return cache.addAll(ASSETS).catch(function(err) {
        console.warn('POSH SW: cache.addAll failed during install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // Only cache GET requests — POST/PUT etc. (e.g. Firebase API) are not cacheable
  if(e.request.method !== 'GET') return;
  // Skip cross-origin requests like Firebase, Google APIs
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).then(function(response) {
        // Only cache valid responses
        if(!response || response.status !== 200 || response.type !== 'basic') return response;
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match('/index.html');
      });
    })
  );
});
