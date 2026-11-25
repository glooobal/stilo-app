import { useSyncExternalStore } from 'react';

// Screens read SQLite synchronously; this counter lets them re-read after a
// write (e.g. when the transaction sheet saves and closes).
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged() {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever local data is modified. Use as a memo/effect dependency. */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
