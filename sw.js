/* London Field Guide — Service Worker v4 */
const CACHE = 'lfg-v4';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icon-192.svg', '/icon-512.svg', '/favicon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
    ])
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept: API calls, config.js (changes each deploy), external resources
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/config.js' ||
    url.hostname !== self.location.hostname
  ) return;

  // Stale-while-revalidate for all same-origin static assets
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fresh = fetch(e.request)
          .then(res => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(e.request, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    )
  );
});
