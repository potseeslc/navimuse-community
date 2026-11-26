const CACHE_NAME = 'navimuse-shell-v5-iphone-direct-audio';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon.svg?v=radio-tower-1', '/favicon-radio-tower.png', '/apple-touch-icon-radio-tower.png', '/radio-tower-192.png', '/radio-tower-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('/');
      return caches.match(event.request).then((cached) => cached || Response.error());
    })
  );
});
