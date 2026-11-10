import type { Note } from './types';

export function renderNotes(list: HTMLElement, notes: Note[]): void {
  list.replaceChildren(
    ...notes.map((note) => {
      const item = document.createElement('li');
      item.className = 'note';

      const title = document.createElement('h2');
      title.textContent = note.title;

      const body = document.createElement('p');
      body.textContent = note.body;

      const time = document.createElement('time');
      time.dateTime = note.updatedAt;
      time.textContent = new Date(note.updatedAt).toLocaleString();

      item.append(title, body, time);
      return item;
    }),
  );
}

export function renderStatus(status: HTMLElement, message: string): void {
  status.textContent = message;
}
