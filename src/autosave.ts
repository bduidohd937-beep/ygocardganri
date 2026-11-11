/** Debounces edits and serializes writes to prevent stale saves overwriting newer ones. */
export type SavePhase = 'pending' | 'writing' | 'saved' | 'error';
export type SaveListener = (phase: SavePhase, error?: unknown) => void;

export function createCoalescedSaver<T>(
  persist: (value: T) => Promise<void>,
  waitMs = 450,
  onState?: SaveListener,
) {
  let newest: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let serial = 0;
  let chain: Promise<void> = Promise.resolve();

  function flush(): Promise<void> {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (newest === undefined) return chain;
    const snapshot = newest;
    const revision = serial;
    newest = undefined;
    chain = chain.catch(() => undefined)
      .then(async () => {
        if (revision === serial) onState?.('writing');
        await persist(snapshot);
        if (revision === serial) onState?.('saved');
      })
      .catch(error => {
        if (revision === serial) onState?.('error', error);
      });
    return chain;
  }

  return {
    schedule(value: T) {
      newest = value;
      serial++;
      if (timer !== undefined) clearTimeout(timer);
      onState?.('pending');
      timer = setTimeout(() => void flush(), waitMs);
    },
    flush,
  };
}