import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { Note } from './types';

export const NOTE_LIMIT = 50;
export const NOTE_DB = 'pulse-offline-notes';

interface NotesDatabase extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { updatedAt: string };
  };
}

export interface NoteCache {
  read(): Promise<Note[]>;
  replace(notes: Note[]): Promise<void>;
}

/** Opens per operation, so unavailable storage can recover on the next load. */
async function withDatabase<T>(run: (db: IDBPDatabase<NotesDatabase>) => Promise<T>): Promise<T> {
  const db = await openDB<NotesDatabase>(NOTE_DB, 1, {
    upgrade(database) {
      database.createObjectStore('notes', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
    },
    blocking() {
      db.close();
    },
  });
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

export const noteCache: NoteCache = {
  read: () => withDatabase(async (db) => {
    const transaction = db.transaction('notes');
    const notes: Note[] = [];
    let cursor = await transaction.store.index('updatedAt').openCursor(null, 'prev');
    while (cursor && notes.length < NOTE_LIMIT) {
      notes.push(cursor.value);
      cursor = await cursor.continue();
    }
    await transaction.done;
    return notes;
  }),

  replace: (notes) => withDatabase(async (db) => {
    const recent = new Map<string, Note>();
    // ISO timestamps are normalized by the API before reaching storage.
    for (const note of [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      if (!recent.has(note.id)) recent.set(note.id, note);
      if (recent.size === NOTE_LIMIT) break;
    }
    const transaction = db.transaction('notes', 'readwrite');
    // Observe completion immediately, including a possible asynchronous abort.
    const completion = transaction.done;
    void completion.catch(() => {});
    // Clear and repopulate atomically: deleted/evicted notes cannot linger,
    // and an aborted write preserves the previous complete snapshot.
    try {
      await transaction.store.clear();
      for (const note of recent.values()) await transaction.store.put(note);
      await completion;
    } catch (error) {
      // A clone/validation failure need not abort IndexedDB automatically.
      try { transaction.abort(); } catch { /* May already be aborted. */ }
      await completion.catch(() => {});
      throw error;
    }
  }),
};
