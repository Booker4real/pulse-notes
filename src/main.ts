import './style.css';

import { loadNotes } from './load-notes';
import { configureOfflineShell, offlineCacheEnabled } from './offline';
import { createRefresh } from './refresh';
import { renderNotes, renderStatus } from './render';

const list = document.querySelector<HTMLUListElement>('#notes')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;

function showStatus(message: string): void {
  if (!navigator.onLine && !message) {
    message = list.childElementCount
      ? 'Offline — showing already loaded notes. Reconnect to refresh.'
      : 'Notes unavailable offline. Connect to load recent notes.';
  }
  renderStatus(status, message);
}

async function loadOnce(): Promise<void> {
  showStatus('Loading…');
  const enabled = await offlineCacheEnabled();
  const shell = configureOfflineShell(enabled).then(() => true, () => false);
  try {
    const result = await loadNotes(enabled);
    renderNotes(list, result.notes);
    showStatus(result.status);
    if (!(await shell) && enabled && !result.status) {
      showStatus('Notes loaded. Offline reopening is unavailable in this browser.');
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Could not load notes');
  } finally {
    // Finish worker setup/cleanup before processing a queued flag refresh.
    await shell;
  }
}

const load = createRefresh(loadOnce);
void load();

// Refresh the last saved snapshot after connectivity returns.
window.addEventListener('online', () => { void load(); });
window.addEventListener('offline', () => {
  showStatus('');
});
