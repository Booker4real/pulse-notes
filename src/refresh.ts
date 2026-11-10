/** Serialize refreshes and coalesce repeated events into one follow-up load. */
export function createRefresh(run: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  let requested = false;
  return () => {
    requested = true;
    if (!running) {
      running = (async () => {
        do {
          requested = false;
          await run();
        } while (requested);
      })().finally(() => { running = undefined; });
    }
    return running;
  };
}
