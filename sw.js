// ═══════════════════════════════════════════════════════
//  POSH — Service Worker  (sw.js)
//
//  AUTO-UPDATE FLOW
//  ────────────────
//  1. You push a fix → bump CACHE_VERSION below (e.g. 'v6' → 'v7').
//  2. Browser downloads the changed sw.js in the background.
//  3. New SW installs, caches fresh files, then calls skipWaiting()
//     so it activates immediately without waiting for all tabs to close.
//  4. On activation the new SW posts  { type: 'POSH_UPDATE_READY' }
//     to every open tab.
//  5. app.js receives the message and shows the "Update available" banner.
//  6. User taps "Update now" → window.location.reload() → fresh app.
//
//  EVERY TIME YOU FIX BUGS: increment the number in CACHE_VERSION.
// ═══════════════════════════════════════════════════════

// ── BUMP THIS on every deploy that should trigger an update ──
const CACHE_VERSION = 'posh-v22';

// Files to cache for offline use
// Add any new JS/CSS files you create to this list.
const STATIC_ASSETS = [
  '/',
   '/index.html',
  '/help.html',
  '/styles.css',
  '/app.js',
  '/posh-utils.js',
  '/firebase.js',
  '/firebase-auth.js',
  '/staff.js',
  '/quickwins.js',
  '/barcode.js',
  '/features.js',
  '/product-images.js',
  '/image-sync.js',
  '/privacy.js',
  '/email.js',
  '/firebase-auth.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ── INSTALL: cache all static assets ────────────────────
self.addEventListener('install', function (event) {
  console.log('[SW] Installing ' + CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // cache.addAll() fails atomically if any request fails —
      // use individual adds so a missing optional file doesn't break the SW.
      return Promise.allSettled(
        STATIC_ASSETS.map(function (url) {
          return cache.add(url).catch(function (e) {
            console.warn('[SW] Could not cache ' + url + ':', e.message);
          });
        })
      );
    }).then(function () {
      console.log('[SW] Install complete — ' + CACHE_VERSION);
      // Skip the waiting phase immediately so the new SW activates
      // as soon as installation finishes, without waiting for all
      // existing tabs to close first.
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: delete old caches ─────────────────────────
self.addEventListener('activate', function (event) {
  console.log('[SW] Activating ' + CACHE_VERSION);

  event.waitUntil(
    // 1. Delete every cache that isn't the current version
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_VERSION; })
            .map(function (key) {
              console.log('[SW] Deleting old cache: ' + key);
              return caches.delete(key);
            })
      );
    }).then(function () {
      // 2. Take control of all open tabs immediately
      return self.clients.claim();
    }).then(function () {
      // 3. Tell every open tab there's fresh code available
      return self.clients.matchAll({ type: 'window' }).then(function (clients) {
        clients.forEach(function (client) {
          client.postMessage({ type: 'POSH_UPDATE_READY', version: CACHE_VERSION });
        });
      });
    }).then(function () {
      console.log('[SW] Activated ' + CACHE_VERSION + ' ✅');
    })
  );
});

// ── FETCH: cache-first for static assets ────────────────
// Strategy: serve from cache if available (fast, works offline),
// fall back to network, update cache in the background.
self.addEventListener('fetch', function (event) {
  // Only handle GET requests for same-origin or CDN assets
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);

  // Pass Firebase / Firestore API calls directly to network —
  // never cache auth or database requests.
  if (
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com')  ||
    url.hostname.includes('gstatic.com')     ||
    url.hostname.includes('firestore.googleapis.com')
  ) {
    return; // let browser handle normally
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      // Serve from cache immediately, then refresh in background
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.status === 200 && response.type !== 'opaque') {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        // Network failed and nothing cached → nothing to do
      });

      // Return cached version instantly if available, otherwise await network
      return cached || networkFetch;
    })
  );
});

// ── MESSAGE HANDLER ─────────────────────────────────────
// app.js can send { type: 'SKIP_WAITING' } to force the waiting
// SW to activate immediately (used by the update banner "Update now" button).
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING — activating now');
    self.skipWaiting();
  }
});
