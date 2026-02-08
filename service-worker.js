// ============================================
// SERVICE WORKER - Solar Tracker PWA
// Offline-first – GitHub Pages kompatibilní
// ============================================

const CACHE_NAME = 'solar-tracker-v19';

// Zjistíme base path z SW scope (funguje na root i GitHub Pages)
const BASE = self.registration.scope;

// Lokální soubory relativně k base
const LOCAL_FILES = [
  '',
  'index.html',
  'style.css',
  'app.js',
  'db.js',
  'charts.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

// Externí zdroje
const EXTERNAL = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// ---- INSTALL: precache vše ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache lokální soubory – absolutní URL z BASE
      const localUrls = LOCAL_FILES.map(f => BASE + f);
      try {
        await cache.addAll(localUrls);
      } catch (e) {
        // Zkusit jeden po jednom, pokud addAll selže
        for (const url of localUrls) {
          try { await cache.add(url); }
          catch (err) { console.warn('Cache skip:', url, err.message); }
        }
      }

      // Cache externí zdroje (best effort)
      for (const url of EXTERNAL) {
        try { await cache.add(url); }
        catch (e) { console.warn('External skip:', url); }
      }
    }).then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: vyčistit staré cache ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---- FETCH: cache-first + network fallback ----
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback – navigace → index.html
          if (event.request.mode === 'navigate' ||
              event.request.destination === 'document') {
            return caches.match(BASE + 'index.html');
          }
        });
    })
  );
});
