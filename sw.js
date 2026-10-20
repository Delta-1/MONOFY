const CACHE_NAME = 'monofy-cache-v44';
const ASSETS = [
  'index.html',
  'legacy-studio.html',
  'hub.js?v=44',
  'hub.css',
  'drive-sync.js',
  'manifest.json',
  'academic.css?v=44',
  'academic-core.js?v=44',
  'academic-export.js?v=44',
  'academic.js?v=44',
  'vendor/docx-9.7.1.js',
  'vendor/mammoth-1.8.0.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'vendor/pdf-6.4.299.mjs',
  'vendor/pdf-worker-6.4.299.mjs',
  'https://fonts.googleapis.com/css2?family=Tinos:ital,wght@0,400;0,700;1,400;1,700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(ASSETS.map(asset => cache.add(asset)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('generativelanguage.googleapis.com')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
