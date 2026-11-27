import type { InstrumentSearchResult } from '@/market/types';

/** How many recently viewed instruments the search keeps. */
export const MAX_RECENT_VIEWS = 10;

function isSearchResult(value: unknown): value is InstrumentSearchResult {
  const item = value as Partial<InstrumentSearchResult> | null;
  return (
    item != null &&
    typeof item.symbol === 'string' &&
    typeof item.name === 'string' &&
    typeof item.exchange === 'string' &&
    typeof item.exchangeName === 'string' &&
    (item.type === 'EQUITY' || item.type === 'ETF')
  );
}

/** Reads the saved list (JSON), skipping anything malformed. */
export function parseRecentViews(text: string | null): InstrumentSearchResult[] {
  try {
    const data = JSON.parse(text ?? '[]') as unknown;
    return Array.isArray(data) ? data.filter(isSearchResult).slice(0, MAX_RECENT_VIEWS) : [];
  } catch {
    return [];
  }
}

/** Puts an instrument at the top of the list (once); returns the new list. */
export function withRecentView(
  list: readonly InstrumentSearchResult[],
  instrument: InstrumentSearchResult
): InstrumentSearchResult[] {
  const { symbol, name, exchange, exchangeName, type } = instrument;
  return [
    { symbol, name, exchange, exchangeName, type },
    ...list.filter((item) => item.symbol !== symbol),
  ].slice(0, MAX_RECENT_VIEWS);
}
