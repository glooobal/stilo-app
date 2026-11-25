import { Storage } from 'expo-sqlite/kv-store';

/**
 * Small persisted UI preferences (selected range, sort order, ...), kept in
 * the SQLite key-value store. Reads are synchronous, so screens can start
 * with the saved value without a flash.
 */
export function readPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  try {
    const value = Storage.getItemSync(key);
    return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string) {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // A preference that fails to save is not worth interrupting the user.
  }
}

export function readNumberPreference(key: string): number | null {
  try {
    const value = Number(Storage.getItemSync(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
