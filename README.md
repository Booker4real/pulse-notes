# Pulse

A small, fast notes app built with Vite and TypeScript.

> This is a demo project for showing [Living Brain](https://livingbrain.com) with coding agents.
> Its code, notes and team history are made up for the demo.

## Develop

```bash
npm install
npm run dev
npm test
```

## Layout

- `src/api.ts`: loads notes from the API.
- `src/render.ts`: renders the note list.
- `src/main.ts`: wires it together.
- `src/note-cache.ts`: IndexedDB storage via `idb`, one record per note with an `updatedAt` index.
- `src/load-notes.ts`: network loading, cache population, and offline fallback.
- `src/offline.ts`: runtime feature flag and service worker setup.
- `src/offline-worker.js`: app-shell caching; the build injects matching versioned assets.
- `public/api/notes.json`: sample data served as the API in development.

## Offline reading

The runtime flag `offline-cache` in `public/features.json` enables this feature.
To disable it without rebuilding, serve `/features.json` with `{"offline-cache": false}`.
Pulse checks this file without the HTTP cache on each load; offline it uses the
last flag value saved by the service worker. Disabling takes effect on the next
online load, stops note-cache reads/writes, and removes Pulse's worker and shell
caches. A device already offline keeps its last known flag until it reconnects.

Each successful notes response atomically replaces the saved snapshot with the
50 most recently updated unique notes, newest first. Older notes and notes absent
from the response are evicted; a successful empty response clears the snapshot.
Online reading still shows the entire response. Network/server failures use the
saved titles and bodies with a cached status; an empty cache asks the user to
connect. Storage failures leave online notes visible, with a status message.
Reconnecting refreshes notes and the saved snapshot.

The production build includes a service worker that saves matching HTML, JS and
CSS so Pulse can reopen without a connection. It never caches API responses;
note data lives only in IndexedDB. Service workers require HTTPS (or localhost).
Development mode supports note caching but does not install an app-shell worker.
First visit online and allow the app resources to finish installing before going
offline. Browser storage is best effort and can be evicted by the browser.

This version provides read-only offline access. Pulse has no accounts, so there
is no account scoping or sign-out cleanup; these must be added with accounts.

To check the production behavior:

```bash
npm test
npm run typecheck
npm run build
npx vite preview --host 127.0.0.1
```

On a phone (served over HTTPS), open Pulse online, then close its tab, disable
connectivity and reopen the same URL. Check that cached titles, bodies and the
offline status appear. Reconnect and verify refreshed notes. With more than
50 notes, only the 50 newest should remain offline. Repeat with storage denied
and the flag disabled. Profile on a mid-range phone for the 50 ms main-thread
budget; desktop viewport emulation does not establish phone performance.
