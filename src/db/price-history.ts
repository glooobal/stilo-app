import { toISODate } from '@/lib/date';
import type { PricePoint } from '@/market/types';

import { getDatabase } from './database';

export type PriceHistoryMeta = {
  currency: string;
  /** Earliest date the stored history covers (`YYYY-MM-DD`). */
  startDate: string;
  /** When the history was last updated from the provider (ms). */
  fetchedAt: number;
};

export function getPriceHistoryMeta(symbol: string): PriceHistoryMeta | null {
  const row = getDatabase().getFirstSync<{
    currency: string;
    start_date: string;
    fetched_at: number;
  }>('SELECT currency, start_date, fetched_at FROM price_history_meta WHERE symbol = ?', symbol);
  return row
    ? { currency: row.currency, startDate: row.start_date, fetchedAt: row.fetched_at }
    : null;
}

/** Date of the newest stored close, or `null` when nothing is stored. */
export function getLastStoredDate(symbol: string): string | null {
  const row = getDatabase().getFirstSync<{ date: string | null }>(
    'SELECT MAX(date) AS date FROM price_history WHERE symbol = ?',
    symbol
  );
  return row?.date ?? null;
}

/** Stored daily closes from `fromDate`, oldest first. */
export function readStoredCloses(symbol: string, fromDate: string): PricePoint[] {
  return getDatabase().getAllSync<PricePoint>(
    'SELECT time, close FROM price_history WHERE symbol = ? AND date >= ? ORDER BY date',
    symbol,
    fromDate
  );
}

/**
 * Upserts daily closes. Rows are keyed by date, so today's still-changing
 * candle is replaced on the next update instead of duplicated.
 */
export function storeCloses(
  symbol: string,
  currency: string,
  points: PricePoint[],
  coveredFrom: string
) {
  const db = getDatabase();
  db.withTransactionSync(() => {
    const insert = db.prepareSync(
      `INSERT INTO price_history (symbol, date, time, close) VALUES (?, ?, ?, ?)
       ON CONFLICT (symbol, date) DO UPDATE SET time = excluded.time, close = excluded.close`
    );
    try {
      for (const point of points) {
        insert.executeSync(symbol, toISODate(new Date(point.time)), point.time, point.close);
      }
    } finally {
      insert.finalizeSync();
    }

    db.runSync(
      `INSERT INTO price_history_meta (symbol, currency, start_date, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (symbol) DO UPDATE SET
         currency = excluded.currency,
         start_date = MIN(price_history_meta.start_date, excluded.start_date),
         fetched_at = excluded.fetched_at`,
      symbol,
      currency,
      coveredFrom,
      Date.now()
    );
  });
}

/** The two newest stored closes, newest first (`time` is the close's time). */
export function readLatestCloses(symbol: string): PricePoint[] {
  return getDatabase().getAllSync<PricePoint>(
    'SELECT time, close FROM price_history WHERE symbol = ? ORDER BY date DESC LIMIT 2',
    symbol
  );
}

/**
 * Drops the stored closes of a symbol, so they are downloaded again (e.g.
 * after a split, when the provider adjusts the whole history).
 */
export function deletePriceHistory(symbol: string) {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM price_history WHERE symbol = ?', symbol);
    db.runSync('DELETE FROM price_history_meta WHERE symbol = ?', symbol);
  });
}
