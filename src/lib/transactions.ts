import type { TransactionWithInstrument } from '@/db/transactions';

/**
 * Order for transaction lists: newest trade date first; on the same date the
 * most recently added one first.
 */
export function sortNewestFirst<T extends Pick<TransactionWithInstrument, 'tradedAt' | 'createdAt'>>(
  transactions: T[]
): T[] {
  return [...transactions].sort((a, b) => {
    if (a.tradedAt !== b.tradedAt) return a.tradedAt < b.tradedAt ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  });
}
