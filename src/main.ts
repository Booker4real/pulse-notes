import './style.css';

import { fetchNotes } from './api';
import { renderNotes, renderStatus } from './render';

const list = document.querySelector<HTMLUListElement>('#notes')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;

async function load(): Promise<void> {
  renderStatus(status, 'Loading…');
  try {
    renderNotes(list, await fetchNotes());
    renderStatus(status, '');
  } catch (error) {
    renderStatus(status, error instanceof Error ? error.message : 'Could not load notes');
  }
}

void load();
