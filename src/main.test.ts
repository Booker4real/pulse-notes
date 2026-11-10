import { expect, it, vi } from 'vitest';

import { loadNotes } from './load-notes';
import type { NotesResult } from './load-notes';

vi.mock('./offline', () => ({
  offlineCacheEnabled: async () => true,
  configureOfflineShell: async () => {},
}));
vi.mock('./load-notes', () => ({ loadNotes: vi.fn() }));

it('preserves offline status when a pending load completes, including empty results', async () => {
  document.body.innerHTML = '<span id="status"></span><ul id="notes"></ul>';
  const connectivity = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  let complete!: (result: NotesResult) => void;
  vi.mocked(loadNotes).mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  await import('./main');
  await vi.waitFor(() => expect(loadNotes).toHaveBeenCalledOnce());
  connectivity.mockReturnValue(false);
  window.dispatchEvent(new Event('offline'));
  expect(document.querySelector('#status')?.textContent).toContain('Notes unavailable offline');
  complete({ notes: [{ id: '1', title: 'Saved title', body: 'Saved body', updatedAt: '2026-11-10T00:00:00Z' }], status: '' });
  await vi.waitFor(() => expect(document.querySelector('.note p')?.textContent).toBe('Saved body'));
  expect(document.querySelector('#status')?.textContent).toContain('Offline');

  vi.mocked(loadNotes).mockResolvedValueOnce({ notes: [], status: '' });
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(document.querySelectorAll('.note')).toHaveLength(0));
  expect(document.querySelector('#status')?.textContent).toContain('Notes unavailable offline');
  connectivity.mockRestore();
});
