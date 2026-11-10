import { describe, expect, it, vi } from 'vitest';

import { fetchNotes, NOTES_URL } from './api';
import type { Note } from './types';

const notes: Note[] = [
  { id: '1', title: 'Older', body: 'a', updatedAt: '2026-11-01T10:00:00.000Z' },
  { id: '2', title: 'Newer', body: 'b', updatedAt: '2026-11-08T10:00:00.000Z' },
];

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('fetchNotes', () => {
  it('requests the notes endpoint and sorts newest first', async () => {
    const fetchImpl = vi.fn(async () => okResponse(notes));

    const result = await fetchNotes(fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledWith(NOTES_URL);
    expect(result.map((note) => note.title)).toEqual(['Newer', 'Older']);
  });

  it('throws a readable error when the request fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }) as Response);

    await expect(fetchNotes(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      'Could not load notes (HTTP 503)',
    );
  });
});
