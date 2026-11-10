import { beforeEach, describe, expect, it, vi } from 'vitest';

import workerSource from './offline-worker.js?raw';

interface WorkerEvent {
  data?: string;
  ports?: { postMessage: (message: unknown) => void }[];
  request?: { url: string; method: string; mode: string };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
}

const files = ['/index.html', '/assets/app.js', '/assets/app.css'];
const cacheName = 'pulse-offline-shell-test';
const shellHtml = '<html><script src="/assets/app.js"></script></html>';
let handlers: Record<string, (event: WorkerEvent) => void>;
let responses: Map<string, Response>;
let fetchImpl: ReturnType<typeof vi.fn>;
let addAll: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
let claim: ReturnType<typeof vi.fn>;
let put: ReturnType<typeof vi.fn>;
let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  handlers = {};
  responses = new Map();
  fetchImpl = vi.fn(async () => new Response('network'));
  addAll = vi.fn(async () => {});
  remove = vi.fn(async () => true);
  claim = vi.fn(async () => {});
  put = vi.fn(async (key: string, response: Response) => { responses.set(key, response); });
  const cache = { addAll, match: async (key: string) => responses.get(key), put };
  const scope = {
    location: { origin: 'https://pulse.test' }, clients: { claim },
    addEventListener: (name: string, handler: (event: WorkerEvent) => void) => { handlers[name] = handler; },
  };
  open = vi.fn(async () => cache);
  const storage = { open,
    keys: async () => [cacheName, 'pulse-offline-shell-old', 'unrelated'], delete: remove };
  new Function('self', 'caches', 'fetch', 'SHELL_FILES', 'SHELL_CACHE', 'SHELL_HTML', workerSource)(
    scope, storage, fetchImpl, files, cacheName, shellHtml,
  );
});

function dispatch(name: string, path = '/', mode = 'navigate', method = 'GET'): Promise<unknown> | undefined {
  let result: Promise<unknown> | undefined;
  handlers[name]({
    request: { url: new URL(path, 'https://pulse.test').href, method, mode },
    waitUntil: (promise) => { result = promise; },
    respondWith: (promise) => { result = promise; },
  });
  return result;
}

describe('offline app shell', () => {
  it('does not fetch shell files again when its cache is already complete', async () => {
    for (const file of [...files, '/features.json']) responses.set(file, new Response('saved'));
    const postMessage = vi.fn();
    let pending: Promise<unknown> | undefined;
    handlers.message({ data: 'ENSURE_SHELL', ports: [{ postMessage }],
      waitUntil: (promise) => { pending = promise; }, respondWith: () => {} });
    await pending;
    expect(addAll).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ ok: true });
  });

  it('repairs removed shell resources when re-enabled with an existing worker', async () => {
    const postMessage = vi.fn();
    let pending: Promise<unknown> | undefined;
    handlers.message({ data: 'ENSURE_SHELL', ports: [{ postMessage }],
      waitUntil: (promise) => { pending = promise; }, respondWith: () => {} });
    await pending;
    expect(addAll).toHaveBeenCalledWith(['/assets/app.js', '/assets/app.css', '/features.json']);
    expect(await responses.get('/index.html')?.text()).toBe(shellHtml);
    expect(postMessage).toHaveBeenCalledWith({ ok: true });
  });

  it('reports failed shell repair without an unhandled worker rejection', async () => {
    open.mockRejectedValue(new Error('Storage unavailable'));
    const postMessage = vi.fn();
    let pending: Promise<unknown> | undefined;
    handlers.message({ data: 'ENSURE_SHELL', ports: [{ postMessage }],
      waitUntil: (promise) => { pending = promise; }, respondWith: () => {} });
    await pending;
    expect(postMessage).toHaveBeenCalledWith({ ok: false });
  });

  it('installs all app resources and runtime config, excluding notes', async () => {
    await dispatch('install');
    expect(addAll).toHaveBeenCalledOnce();
    expect(addAll).toHaveBeenCalledWith(['/assets/app.js', '/assets/app.css', '/features.json']);
    const html = responses.get('/index.html');
    expect(html?.headers.get('Content-Type')).toContain('text/html');
    expect(await html?.text()).toBe(shellHtml);
  });

  it('rejects installation when precaching fails', async () => {
    addAll.mockRejectedValue(new Error('Storage unavailable'));
    await expect(dispatch('install')).rejects.toThrow('Storage unavailable');
  });

  it('removes obsolete Pulse shells and claims clients on activation', async () => {
    await dispatch('activate');
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('pulse-offline-shell-old');
    expect(claim).toHaveBeenCalledOnce();
  });

  it('reopens cached HTML and assets without a network', async () => {
    responses.set('/index.html', new Response('cached html'));
    responses.set('/assets/app.js', new Response('cached js'));
    fetchImpl.mockRejectedValue(new Error('offline'));
    expect(await ((await dispatch('fetch')) as Response).text()).toBe('cached html');
    expect(await ((await dispatch('fetch', '/assets/app.js', 'cors')) as Response).text()).toBe('cached js');
  });

  it('never caches API data, foreign requests, unknown routes or writes', () => {
    for (const [path, mode, method] of [
      ['/api/notes.json', 'cors', 'GET'], ['https://other.test/', 'navigate', 'GET'],
      ['/unknown', 'navigate', 'GET'], ['/', 'navigate', 'POST'],
    ]) expect(dispatch('fetch', path, mode, method)).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads fresh config online and falls back to it offline', async () => {
    fetchImpl.mockResolvedValue(new Response('{"offline-cache":false}'));
    expect(await ((await dispatch('fetch', '/features.json', 'cors')) as Response).json())
      .toEqual({ 'offline-cache': false });
    fetchImpl.mockRejectedValue(new Error('offline'));
    expect(await ((await dispatch('fetch', '/features.json', 'cors')) as Response).json())
      .toEqual({ 'offline-cache': false });
  });

  it('still returns fresh config when updating storage fails', async () => {
    put.mockRejectedValue(new Error('QuotaExceededError'));
    expect(await ((await dispatch('fetch', '/features.json', 'cors')) as Response).text()).toBe('network');
  });

  it('keeps online navigation, config and assets working when storage cannot open', async () => {
    open.mockRejectedValue(new Error('Storage unavailable'));
    for (const [path, mode] of [['/', 'navigate'], ['/features.json', 'cors'], ['/assets/app.js', 'cors']]) {
      expect(await ((await dispatch('fetch', path, mode)) as Response).text()).toBe('network');
    }
  });

  it('does not mix a new online HTML response into the installed shell', async () => {
    responses.set('/index.html', new Response('installed html'));
    expect(await ((await dispatch('fetch')) as Response).text()).toBe('network');
    expect(put).not.toHaveBeenCalled();
    fetchImpl.mockRejectedValue(new Error('offline'));
    expect(await ((await dispatch('fetch')) as Response).text()).toBe('installed html');
  });
});
