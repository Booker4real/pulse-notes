import type { Note } from './types';

export const NOTES_URL = '/api/notes.json';

/** Fetch the user's notes, most recently updated first. */
export async function fetchNotes(fetchImpl: typeof fetch = fetch): Promise<Note[]> {
  const response = await fetchImpl(NOTES_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load notes (HTTP ${response.status})`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Could not load notes (invalid response)');
  const notes: Note[] = data.map((note: unknown) => {
    if (typeof note !== 'object' || note === null ||
      !('id' in note) || typeof note.id !== 'string' || !note.id ||
      !('title' in note) || typeof note.title !== 'string' ||
      !('body' in note) || typeof note.body !== 'string' ||
      !('updatedAt' in note) || typeof note.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(note.updatedAt))) {
      throw new Error('Could not load notes (invalid response)');
    }
    return { id: note.id, title: note.title, body: note.body,
      updatedAt: new Date(note.updatedAt).toISOString() };
  });
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
