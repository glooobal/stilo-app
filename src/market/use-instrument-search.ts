import { useEffect, useState } from 'react';

import { getCachedSearch, setCachedSearch } from '@/db/search-cache';

import { marketData, MarketDataError, type InstrumentSearchResult } from './index';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

/** In-memory layer on top of the SQLite cache, for the current app session. */
const memoryCache = new Map<string, InstrumentSearchResult[]>();

type SearchState = {
  results: InstrumentSearchResult[];
  isLoading: boolean;
  error: string | null;
};

function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

/**
 * Remote instrument search with three layers: memory, SQLite (7 days) and the
 * provider. Requests are debounced and the previous one is cancelled while typing.
 */
export function useInstrumentSearch(query: string, enabled = true): SearchState {
  const normalized = normalizeQuery(query);
  const [state, setState] = useState<SearchState>({ results: [], isLoading: false, error: null });

  useEffect(() => {
    if (!enabled || normalized.length < MIN_QUERY_LENGTH) {
      setState({ results: [], isLoading: false, error: null });
      return;
    }

    const cached = memoryCache.get(normalized) ?? getCachedSearch(normalized);
    if (cached) {
      memoryCache.set(normalized, cached);
      setState({ results: cached, isLoading: false, error: null });
      return;
    }

    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const results = await marketData.searchInstruments(normalized, controller.signal);
        memoryCache.set(normalized, results);
        setCachedSearch(normalized, results);
        setState({ results, isLoading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof MarketDataError ? error.message : 'Brak połączenia z internetem.';
        setState({ results: [], isLoading: false, error: message });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [normalized, enabled]);

  return state;
}

export { MIN_QUERY_LENGTH };
