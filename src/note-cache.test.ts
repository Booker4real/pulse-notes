import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';

import { NOTE_DB, noteCache } from './note-cache';
import type { Note } from './types';

const makeNote = (index: number): Note => ({
  id: String(index), title: `Note ${index}`, body: 'Saved body',
  updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
});

beforeEach(async () => { await deleteDB(NOTE_DB); });

describe('note cache', () => {
  it('persists just the newest 50 unique notes across database reopenings', async () => {
    const notes = Array.from({ length: 75 }, (_, index) => makeNote(index));
    await noteCache.replace([...notes, { ...notes[0], title: 'Older duplicate' }]);
    const saved = await noteCache.read();
    expect(saved).toEqual(notes.slice(25).reverse());
    const db = await openDB(NOTE_DB);
    expect(await db.count('notes')).toBe(50);
    expect(db.transaction('notes').store.indexNames.contains('updatedAt')).toBe(true);
    db.close();
  });

  it('updates changed notes and removes notes absent from the latest response', async () => {
    await noteCache.replace([makeNote(1), makeNote(2)]);
    const changed = { ...makeNote(1), title: 'Updated', body: 'Updated body' };
    await noteCache.replace([changed]);
    expect(await noteCache.read()).toEqual([changed]);
    await noteCache.replace([]);
    expect(await noteCache.read()).toEqual([]);
  });

  it('keeps the newest duplicate and handles tied timestamps', async () => {
    const newer = { ...makeNote(3), id: 'same' };
    await noteCache.replace([{ ...makeNote(1), id: 'same' }, newer, makeNote(3)]);
    const saved = await noteCache.read();
    expect(saved).toHaveLength(2);
    expect(saved.find((note) => note.id === 'same')).toEqual(newer);
  });

  it('preserves the previous snapshot when a transaction aborts', async () => {
    await noteCache.replace([makeNote(1)]);
    const uncloneable = { ...makeNote(2), body: (() => 'invalid') as unknown as string };
    await expect(noteCache.replace([uncloneable])).rejects.toThrow();
    expect(await noteCache.read()).toEqual([makeNote(1)]);
  });
});
