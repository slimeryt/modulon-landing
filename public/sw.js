// Modulon service worker — network-first, no aggressive caching.
// Exists primarily to satisfy PWA installability requirements.

const CACHE = 'modulon-v1';

// Assets to pre-cache so the app shell loads instantly after first visit.
const PRECACHE = ['/', '/chat', '/login', '/signup'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(PRECACHE).catch(() => {
        /* ignore pre-cache errors (e.g. auth-gated routes) */
      })
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle GET requests to same origin.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // API calls — always network, never cache.
  if (url.pathname.startsWith('/api')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful responses for offline fallback.
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
