import type { Split } from '@/lib/splits';

import { getDatabase } from './database';
import { deletePriceHistory } from './price-history';

type SplitRow = { symbol: string; date: string; numerator: number; denominator: number };

/** Every stored split, per symbol, oldest first. */
export function getAllSplits(): Map<string, Split[]> {
  const rows = getDatabase().getAllSync<SplitRow>(
    'SELECT symbol, date, numerator, denominator FROM splits ORDER BY date'
  );
  const map = new Map<string, Split[]>();
  for (const row of rows) {
    const list = map.get(row.symbol) ?? [];
    list.push({ date: row.date, numerator: row.numerator, denominator: row.denominator });
    map.set(row.symbol, list);
  }
  return map;
}

export function getSplits(symbol: string): Split[] {
  return getDatabase().getAllSync<Split>(
    'SELECT date, numerator, denominator FROM splits WHERE symbol = ? ORDER BY date',
    symbol
  );
}

export function getSplitsMeta(symbol: string): { checkedFrom: string; fetchedAt: number } | null {
  const row = getDatabase().getFirstSync<{ checked_from: string; fetched_at: number }>(
    'SELECT checked_from, fetched_at FROM splits_meta WHERE symbol = ?',
    symbol
  );
  return row ? { checkedFrom: row.checked_from, fetchedAt: row.fetched_at } : null;
}

/**
 * Saves the splits found since `checkedFrom`. Returns `true` when one of them
 * is new: then the stored closes (adjusted by the provider since) are dropped.
 */
export function storeSplits(symbol: string, splits: Split[], checkedFrom: string): boolean {
  const db = getDatabase();
  const known = new Set(getSplits(symbol).map((split) => split.date));
  const isNew = splits.some((split) => !known.has(split.date));

  db.withTransactionSync(() => {
    for (const split of splits) {
      db.runSync(
        `INSERT INTO splits (symbol, date, numerator, denominator) VALUES (?, ?, ?, ?)
         ON CONFLICT (symbol, date) DO UPDATE SET
           numerator = excluded.numerator, denominator = excluded.denominator`,
        symbol,
        split.date,
        split.numerator,
        split.denominator
      );
    }
    db.runSync(
      `INSERT INTO splits_meta (symbol, checked_from, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT (symbol) DO UPDATE SET
         checked_from = MIN(splits_meta.checked_from, excluded.checked_from),
         fetched_at = excluded.fetched_at`,
      symbol,
      checkedFrom,
      Date.now()
    );
  });
  if (isNew) deletePriceHistory(symbol);
  return isNew;
}
