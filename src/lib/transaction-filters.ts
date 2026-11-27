import type { TransactionSide } from '@/db/transactions';

/**
 * `cash`: deposits, withdrawals and interest of cash portfolios;
 * `dividend`: dividends received.
 */
export type SideFilter = 'all' | TransactionSide | 'cash' | 'dividend';

export type TransactionFilters = {
  side: SideFilter;
  /** `null`: every portfolio. */
  portfolioId: string | null;
  /** Part of the instrument name or symbol. */
  query: string;
  /** Operations of one calendar year; `null`: every year. */
  year: number | null;
  /** A date range, `YYYY-MM-DD`, both ends included; `null`: open. */
  from: string | null;
  to: string | null;
};

export const NO_FILTERS: TransactionFilters = {
  side: 'all',
  portfolioId: null,
  query: '',
  year: null,
  from: null,
  to: null,
};

/** Order of the history: by date either way, or the largest amounts first. */
export type HistorySort = 'newest' | 'oldest' | 'amount';

/** `YYYY-MM-DD` in the selected year and date range (each optional). */
function inPeriod(date: string, filters: TransactionFilters): boolean {
  return (
    (filters.year == null || date.startsWith(`${filters.year}-`)) &&
    (filters.from == null || date >= filters.from) &&
    (filters.to == null || date <= filters.to)
  );
}

/** Years with any of the dates, newest first (for the year filter). */
export function yearsOf(dates: Iterable<string>): number[] {
  const years = new Set<number>();
  for (const date of dates) years.add(Number(date.slice(0, 4)));
  return [...years].filter(Number.isFinite).sort((a, b) => b - a);
}

type Filterable = {
  tradedAt: string;
  side: TransactionSide;
  portfolioId: string;
  symbol: string;
  instrument: { name: string };
};

/** Lower case without Polish (and other) diacritics: "Żabka" matches "zabka". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .trim();
}

export function hasFilters(filters: TransactionFilters): boolean {
  return (
    filters.side !== 'all' ||
    filters.portfolioId != null ||
    filters.year != null ||
    filters.from != null ||
    filters.to != null ||
    filters.query.trim() !== ''
  );
}

export function filterTransactions<T extends Filterable>(
  transactions: T[],
  filters: TransactionFilters
): T[] {
  const query = normalize(filters.query);
  if (filters.side === 'cash' || filters.side === 'dividend') return [];
  return transactions.filter(
    (transaction) =>
      (filters.side === 'all' || transaction.side === filters.side) &&
      inPeriod(transaction.tradedAt, filters) &&
      (filters.portfolioId == null || transaction.portfolioId === filters.portfolioId) &&
      (query === '' ||
        normalize(transaction.instrument.name).includes(query) ||
        normalize(transaction.symbol).includes(query))
  );
}

/** Cash operations shown with the filters: by portfolio, not when searching an instrument. */
export function filterCashOperations<T extends { portfolioId: string; date: string }>(
  operations: T[],
  filters: TransactionFilters
): T[] {
  if (filters.side !== 'all' && filters.side !== 'cash') return [];
  if (filters.query.trim() !== '') return [];
  return operations.filter(
    (operation) =>
      inPeriod(operation.date, filters) &&
      (filters.portfolioId == null || operation.portfolioId === filters.portfolioId)
  );
}

/** Dividends shown with the filters: by portfolio and by instrument, like trades. */
export function filterDividends<
  T extends { portfolioId: string; symbol: string; paidAt: string; instrument: { name: string } },
>(dividends: T[], filters: TransactionFilters): T[] {
  if (filters.side !== 'all' && filters.side !== 'dividend') return [];
  const query = normalize(filters.query);
  return dividends.filter(
    (dividend) =>
      inPeriod(dividend.paidAt, filters) &&
      (filters.portfolioId == null || dividend.portfolioId === filters.portfolioId) &&
      (query === '' ||
        normalize(dividend.instrument.name).includes(query) ||
        normalize(dividend.symbol).includes(query))
  );
}
