import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureOfflineShell, ensureShell, FEATURES_URL, offlineCacheEnabled, waitForShell } from './offline';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('offline-cache flag', () => {
  it.each([true, false, 'true', null])('only enables for literal true: %j', async (value) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ 'offline-cache': value })));
    expect(await offlineCacheEnabled(fetchImpl)).toBe(value === true);
    expect(fetchImpl).toHaveBeenCalledWith(FEATURES_URL, { cache: 'no-store' });
  });

  it('fails closed for unavailable or invalid config', async () => {
    for (const response of [new Response('{}'), new Response('null'), new Response('{'),
      new Response('', { status: 503 })]) {
      expect(await offlineCacheEnabled(async () => response)).toBe(false);
    }
    expect(await offlineCacheEnabled(async () => { throw new Error('offline'); })).toBe(false);
  });

  it('removes only Pulse workers and shell caches when disabled', async () => {
    const unregisterPulse = vi.fn(async () => true);
    const unregisterOther = vi.fn(async () => true);
    vi.stubGlobal('navigator', { serviceWorker: {
      getRegistrations: async () => [
        { active: { scriptURL: new URL('/offline-worker.js', location.origin).href }, unregister: unregisterPulse },
        { active: { scriptURL: new URL('/other.js', location.origin).href }, unregister: unregisterOther },
      ],
    } });
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['pulse-offline-shell-old', 'other-cache'], delete: remove });
    await configureOfflineShell(false);
    expect(unregisterPulse).toHaveBeenCalledOnce();
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('pulse-offline-shell-old');
  });

  it('reports missing service worker support without affecting flag-off use', async () => {
    vi.stubGlobal('navigator', {});
    await expect(configureOfflineShell(true)).rejects.toThrow('unavailable');
    await expect(configureOfflineShell(false)).resolves.toBeUndefined();
  });
});

describe('worker installation', () => {
  function mockChannel() {
    const close = vi.fn();
    const channel = { port1: { onmessage: null as ((event: { data: unknown }) => void) | null, close },
      port2: { close } };
    vi.stubGlobal('MessageChannel', class { constructor() { return channel; } });
    return channel;
  }

  it('requires a worker acknowledgement and closes message ports', async () => {
    const channel = mockChannel();
    const postMessage = vi.fn();
    const ready = ensureShell({ postMessage } as unknown as ServiceWorker);
    expect(postMessage).toHaveBeenCalledWith('ENSURE_SHELL', [channel.port2]);
    channel.port1.onmessage?.({ data: { ok: true } });
    await expect(ready).resolves.toBeUndefined();
    expect(channel.port1.close).toHaveBeenCalledTimes(2);
  });

  it('reports unsuccessful repairs', async () => {
    const channel = mockChannel();
    const ready = ensureShell({ postMessage: vi.fn() } as unknown as ServiceWorker);
    channel.port1.onmessage?.({ data: { ok: false } });
    await expect(ready).rejects.toThrow('Offline shell unavailable');
  });

  it('repairs active and waiting workers when re-enabling', async () => {
    vi.stubEnv('PROD', true);
    mockChannel();
    const postMessage = vi.fn((_message, ports) => {
      expect(ports).toHaveLength(1);
    });
    // Each handshake gets its own independent port pair.
    vi.stubGlobal('MessageChannel', class {
      port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close: vi.fn() };
      port2 = { close: vi.fn() };
      constructor() { queueMicrotask(() => this.port1.onmessage?.({ data: { ok: true } })); }
    });
    vi.stubGlobal('navigator', { serviceWorker: { register: async () => ({
      active: { state: 'activated', postMessage }, waiting: { state: 'installed', postMessage },
    }) } });
    await configureOfflineShell(true);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  function makeWorker() {
    const worker = Object.assign(new EventTarget(), { state: 'installing' });
    return worker;
  }

  it('waits for a completely installed shell', async () => {
    const worker = makeWorker();
    const ready = waitForShell(worker as unknown as ServiceWorker);
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    await expect(ready).resolves.toBeUndefined();
  });

  it('reports failed installations', async () => {
    const worker = makeWorker();
    const ready = waitForShell(worker as unknown as ServiceWorker);
    worker.state = 'redundant';
    worker.dispatchEvent(new Event('statechange'));
    await expect(ready).rejects.toThrow('installation failed');
  });

  it('reports stalled installations', async () => {
    vi.useFakeTimers();
    const ready = waitForShell(makeWorker() as unknown as ServiceWorker);
    const assertion = expect(ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });
});
