// Replaced with this release's content hash and complete asset list by Vite.
const CACHE_NAME = __CACHE_NAME__;
const APP_SHELL = __APP_SHELL__;
const shellPaths = new Set(APP_SHELL);

function validShellResponse(path, response) {
  if (!response.ok || response.redirected) return false;
  const type = response.headers.get('content-type') || '';
  if (path.endsWith('.js')) return /javascript/.test(type);
  if (path.endsWith('.css')) return /text\/css/.test(type);
  if (path.endsWith('.html')) return /text\/html/.test(type);
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Finish every request before removing a failed partial installation.
    const results = await Promise.allSettled(APP_SHELL.map(async path => {
      const response = await fetch(new Request(new URL(path, self.location.origin), { cache: 'reload' }));
      if (!validShellResponse(path, response)) throw new Error('Incomplete offline shell');
      await cache.put(path, response);
    }));
    if (results.some(result => result.status === 'rejected')) {
      await caches.delete(CACHE_NAME);
      throw new Error('Offline shell installation failed');
    }
  })());
  // Let existing listening sessions keep their worker and matching assets.
  // The new release activates when the previous worker has no open clients.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('navimuse-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !shellPaths.has(url.pathname)) return;
  event.respondWith((async () => {
    const path = navigation ? '/index.html' : url.pathname;
    const cache = await caches.open(CACHE_NAME).catch(() => null);
    const cached = await cache?.match(path).catch(() => null);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      // Never mix a newer network HTML document into an older release cache.
      if (!navigation && validShellResponse(path, response)) {
        await cache?.put(path, response.clone()).catch(() => {});
      }
      return response;
    } catch { return Response.error(); }
  })());
});
