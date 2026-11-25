import type { TransactionSide } from '@/db/transactions';

export type SideFilter = 'all' | TransactionSide;

export type TransactionFilters = {
  side: SideFilter;
  /** `null`: every portfolio. */
  portfolioId: string | null;
  /** Part of the instrument name or symbol. */
  query: string;
};

export const NO_FILTERS: TransactionFilters = { side: 'all', portfolioId: null, query: '' };

type Filterable = {
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
  return filters.side !== 'all' || filters.portfolioId != null || filters.query.trim() !== '';
}

export function filterTransactions<T extends Filterable>(
  transactions: T[],
  filters: TransactionFilters
): T[] {
  const query = normalize(filters.query);
  return transactions.filter(
    (transaction) =>
      (filters.side === 'all' || transaction.side === filters.side) &&
      (filters.portfolioId == null || transaction.portfolioId === filters.portfolioId) &&
      (query === '' ||
        normalize(transaction.instrument.name).includes(query) ||
        normalize(transaction.symbol).includes(query))
  );
}
