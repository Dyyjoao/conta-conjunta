const CACHE = 'conta-conjunta-v0.5.3';
const CORE = [
  './',
  'index.html',
  'style.css',
  'enhancements.css',
  'features.css',
  'boot-guard.js',
  'app.js',
  'post-login-loader.js',
  'dashboard-enhancements.js',
  'categories-enhancements.js',
  'features-loader.js',
  'ofx-enhancements.js',
  'cards-enhancements.js',
  'investments-enhancements.js',
  'reserves-enhancements.js',
  'accounts-enhancements.js',
  'transactions-enhancements.js',
  'income-expense-pages.js',
  'firebase-config.js',
  'manifest.webmanifest',
  'assets/icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (event.request.url.startsWith(self.location.origin) && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});