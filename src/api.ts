import type { Note } from './types';

export const NOTES_URL = '/api/notes.json';

/** Fetch the user's notes, most recently updated first. */
export async function fetchNotes(fetchImpl: typeof fetch = fetch): Promise<Note[]> {
  const response = await fetchImpl(NOTES_URL);
  if (!response.ok) {
    throw new Error(`Could not load notes (HTTP ${response.status})`);
  }
  const notes = (await response.json()) as Note[];
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
