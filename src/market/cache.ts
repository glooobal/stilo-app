type Entry<T> = { value: T; expiresAt: number };

const entries = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Memoizes an async load for `ttlMs` and shares one request between callers
 * that ask for the same key at the same time.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const entry = entries.get(key) as Entry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) {
    return Promise.resolve(entry.value);
  }
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = load()
    .then((value) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** Drops cached entries whose key starts with `prefix` (e.g. one symbol after a split). */
export function forgetCached(prefix: string) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

/** Drops cached market data, e.g. on pull to refresh. */
export function clearMarketCache() {
  entries.clear();
}

/** Runs async tasks with limited concurrency, to stay gentle on the provider. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
