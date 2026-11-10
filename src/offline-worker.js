/* SHELL_FILES, SHELL_HTML and SHELL_CACHE are injected by the production build. */
const FEATURES = '/features.json';

async function populateShell(cache) {
  await cache.addAll([...SHELL_FILES.filter((file) => file !== '/index.html'), FEATURES]);
  // An old worker may repair its shell after a newer deployment. Embed its
  // matching HTML so a repair never pairs new HTML with old hashed assets.
  await cache.put('/index.html', new Response(SHELL_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Install only a complete, matching HTML/JS/CSS set. Never cache note API data.
    await populateShell(cache);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys())
      .filter((key) => key.startsWith('pulse-offline-shell-') && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// unregister() can leave an old worker controlling open tabs. Re-enabling
// must repair a removed/evicted shell even if registration reuses that worker.
self.addEventListener('message', (event) => {
  if (event.data !== 'ENSURE_SHELL' || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      const files = [...SHELL_FILES, FEATURES];
      const saved = await Promise.all(files.map((file) => cache.match(file)));
      if (saved.some((response) => !response)) await populateShell(cache);
      event.ports[0].postMessage({ ok: true });
    } catch {
      event.ports[0].postMessage({ ok: false });
    }
  })());
});

async function cachedResponse(key) {
  try {
    return await (await caches.open(SHELL_CACHE)).match(key);
  } catch {
    return undefined;
  }
}

async function networkOrCached(request, key, update = false) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      if (update) {
        // Storage failures must not discard a successful runtime flag response.
        try {
          await (await caches.open(SHELL_CACHE)).put(key, response.clone());
        } catch { /* Best effort. */ }
      }
      return response;
    }
    // A server error may be transient; preserve the last usable offline shell.
    if (response.status < 500) return response;
    const cached = await cachedResponse(key);
    return cached || response;
  } catch (error) {
    const cached = await cachedResponse(key);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname === FEATURES) {
    event.respondWith(networkOrCached(request, FEATURES, true));
  } else if (request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname)) {
    // Do not overwrite the precached HTML with a different deployment's HTML.
    event.respondWith(networkOrCached(request, '/index.html'));
  } else if (SHELL_FILES.includes(url.pathname) && url.pathname !== '/index.html') {
    event.respondWith((async () => {
      return (await cachedResponse(url.pathname)) || fetch(request);
    })());
  }
});
