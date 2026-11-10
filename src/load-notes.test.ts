import { describe, expect, it, vi } from 'vitest';

import { loadNotes } from './load-notes';
import type { NoteCache } from './note-cache';
import type { Note } from './types';

const notes: Note[] = [{ id: '1', title: 'Saved', body: 'Body', updatedAt: '2026-11-10T00:00:00.000Z' }];
const online = vi.fn(async () => new Response(JSON.stringify(notes)));
const offline = vi.fn(async (): Promise<Response> => { throw new TypeError('Failed to fetch'); });
const makeCache = (): NoteCache => ({ read: vi.fn(async () => notes), replace: vi.fn(async () => {}) });

describe('loadNotes', () => {
  it('populates storage after a successful network read', async () => {
    const cache = makeCache();
    expect(await loadNotes(true, online, cache)).toEqual({ notes, status: '' });
    expect(cache.replace).toHaveBeenCalledWith(notes);
    expect(cache.read).not.toHaveBeenCalled();
  });

  it('falls back to saved titles and bodies on network failure', async () => {
    const cache = makeCache();
    const result = await loadNotes(true, offline, cache);
    expect(result.notes).toEqual(notes);
    expect(result.status).toContain('cached notes');
    expect(cache.replace).not.toHaveBeenCalled();
  });

  it('shows a useful empty state on a first offline visit', async () => {
    const cache = makeCache();
    cache.read = vi.fn(async () => []);
    expect(await loadNotes(true, offline, cache)).toEqual({
      notes: [], status: 'Notes unavailable offline. Connect to load and save recent notes.',
    });
  });

  it('keeps online notes visible when a cache write fails', async () => {
    const cache = makeCache();
    cache.replace = vi.fn().mockRejectedValue(new Error('QuotaExceededError'));
    const result = await loadNotes(true, online, cache);
    expect(result.notes).toEqual(notes);
    expect(result.status).toContain('Could not update');
    expect(cache.read).not.toHaveBeenCalled();
  });

  it('handles unavailable IndexedDB during fallback', async () => {
    const cache = makeCache();
    cache.read = vi.fn().mockRejectedValue(new Error('SecurityError'));
    expect(await loadNotes(true, offline, cache)).toEqual({
      notes: [], status: 'Could not load notes. Offline storage is unavailable.',
    });
  });

  it('does not read or write storage with the flag disabled', async () => {
    const cache = makeCache();
    expect(await loadNotes(false, online, cache)).toEqual({ notes, status: '' });
    await expect(loadNotes(false, offline, cache)).rejects.toThrow('Failed to fetch');
    expect(cache.read).not.toHaveBeenCalled();
    expect(cache.replace).not.toHaveBeenCalled();
  });

  it('preserves the snapshot when the API returns an error or malformed data', async () => {
    const cache = makeCache();
    for (const response of [new Response('', { status: 503 }), new Response('{'), new Response('{}')]) {
      expect((await loadNotes(true, async () => response, cache)).notes).toEqual(notes);
    }
    expect(cache.replace).not.toHaveBeenCalled();
  });
});
