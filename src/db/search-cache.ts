import type { InstrumentSearchResult } from '@/market/types';

import { getDatabase } from './database';

/** Search results for a phrase barely change, so they are kept for a week. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Bump when result filtering changes, so stale cached results are ignored. */
const CACHE_VERSION = 2;

const cacheKey = (query: string) => `v${CACHE_VERSION}:${query}`;

export function getCachedSearch(query: string): InstrumentSearchResult[] | null {
  const row = getDatabase().getFirstSync<{ results: string; fetched_at: number }>(
    'SELECT results, fetched_at FROM search_cache WHERE query = ?',
    cacheKey(query)
  );
  if (!row || Date.now() - row.fetched_at > MAX_AGE_MS) {
    return null;
  }
  try {
    return JSON.parse(row.results) as InstrumentSearchResult[];
  } catch {
    return null;
  }
}

export function setCachedSearch(query: string, results: InstrumentSearchResult[]) {
  getDatabase().runSync(
    `INSERT INTO search_cache (query, results, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT (query) DO UPDATE SET results = excluded.results, fetched_at = excluded.fetched_at`,
    cacheKey(query),
    JSON.stringify(results),
    Date.now()
  );
}
