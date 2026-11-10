import { fetchNotes } from './api';
import { noteCache, type NoteCache } from './note-cache';
import type { Note } from './types';

export interface NotesResult {
  notes: Note[];
  status: string;
}

export async function loadNotes(
  offlineCache: boolean,
  fetchImpl: typeof fetch = fetch,
  cache: NoteCache = noteCache,
): Promise<NotesResult> {
  let notes: Note[];
  try {
    notes = await fetchNotes(fetchImpl);
  } catch (error) {
    if (!offlineCache) throw error;
    let cached: Note[];
    try {
      cached = await cache.read();
    } catch {
      return { notes: [], status: 'Could not load notes. Offline storage is unavailable.' };
    }
    return {
      notes: cached,
      status: cached.length
        ? 'Offline / cached notes — showing the last saved copy (up to 50 notes).'
        : 'Notes unavailable offline. Connect to load and save recent notes.',
    };
  }

  if (offlineCache) {
    try {
      await cache.replace(notes);
    } catch {
      return { notes, status: 'Notes loaded. Could not update the offline cache.' };
    }
  }
  return { notes, status: '' };
}
