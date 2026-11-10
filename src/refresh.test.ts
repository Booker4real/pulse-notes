import { describe, expect, it, vi } from 'vitest';

import { loadNotes } from './load-notes';
import { createRefresh } from './refresh';
import type { Note } from './types';

describe('refresh scheduling', () => {
  it('serializes requests so a slow old response cannot overwrite refreshed notes', async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const note = (title: string): Note => ({
      id: title, title, body: title, updatedAt: '2026-11-10T00:00:00.000Z',
    });
    const older = [note('older')];
    const newer = [note('newer')];
    const fetchImpl = vi.fn().mockReturnValueOnce(first)
      .mockResolvedValueOnce(new Response(JSON.stringify(newer)));
    let saved: Note[] = [];
    let visible: Note[] = [];
    const refresh = createRefresh(async () => {
      const result = await loadNotes(true, fetchImpl, {
        read: async () => saved, replace: async (notes) => { saved = notes; },
      });
      visible = result.notes;
    });
    const pending = refresh();
    void refresh();
    void refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveFirst(new Response(JSON.stringify(older)));
    await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(saved).toEqual(newer);
    expect(visible).toEqual(newer);
  });

  it('accepts another refresh after a failed run', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined);
    const refresh = createRefresh(run);
    await expect(refresh()).rejects.toThrow('failed');
    await expect(refresh()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
