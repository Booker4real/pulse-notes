export const FEATURES_URL = '/features.json';
export const SHELL_CACHE_PREFIX = 'pulse-offline-shell-';

/** Runtime flag; the worker supplies its last known value when offline. */
export async function offlineCacheEnabled(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(FEATURES_URL, { cache: 'no-store' });
    if (!response.ok) return false;
    const flags: unknown = await response.json();
    return typeof flags === 'object' && flags !== null &&
      'offline-cache' in flags && flags['offline-cache'] === true;
  } catch {
    return false;
  }
}

/** Only register the generated production worker, never Vite's development files. */
export async function configureOfflineShell(enabled: boolean): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    if (enabled) throw new Error('Service workers unavailable');
    return;
  }
  if (enabled) {
    if (import.meta.env.PROD) {
      const registration = await navigator.serviceWorker.register('/offline-worker.js', { updateViaCache: 'none' });
      if (!registration.active && !registration.waiting && registration.installing) {
        await waitForShell(registration.installing);
      }
      // A waiting update may also have lost its cache while the flag was off.
      // Repair both versions before either can become the offline shell.
      const workers = new Set([registration.active, registration.waiting, registration.installing]
        .filter((worker): worker is ServiceWorker => !!worker &&
          worker.state !== 'installing' && worker.state !== 'redundant'));
      if (!workers.size) throw new Error('Offline worker unavailable');
      await Promise.all([...workers].map(ensureShell));
    }
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations
    .filter((registration) => [registration.active, registration.waiting, registration.installing]
      .some((worker) => worker?.scriptURL === new URL('/offline-worker.js', location.origin).href))
    .map((registration) => registration.unregister()));
  if ('caches' in globalThis) {
    await Promise.all((await caches.keys())
      .filter((key) => key.startsWith(SHELL_CACHE_PREFIX))
      .map((key) => caches.delete(key)));
  }
}

export function ensureShell(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (ok: boolean) => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      if (ok) resolve(); else reject(new Error('Offline shell unavailable'));
    };
    const timeout = setTimeout(() => finish(false), 10000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      finish(typeof data === 'object' && data !== null && 'ok' in data && data.ok === true);
    };
    try { worker.postMessage('ENSURE_SHELL', [channel.port2]); } catch { finish(false); }
  });
}

/** register() resolves before install; surface failed precaching as unavailable. */
export function waitForShell(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => {
      if (worker.state === 'installed' || worker.state === 'activated') finish();
      if (worker.state === 'redundant') finish(new Error('Offline shell installation failed'));
    };
    const timeout = setTimeout(() => finish(new Error('Offline shell installation timed out')), 10000);
    worker.addEventListener('statechange', changed);
    changed();
  });
}
