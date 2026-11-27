import type { DividendEvent } from '@/market/types';

import { getDatabase } from './database';

/** Stored dividends per share of a symbol, oldest first. */
export function getDividendEvents(symbol: string): DividendEvent[] {
  return getDatabase().getAllSync<DividendEvent>(
    `SELECT ex_date AS exDate, amount, currency FROM dividend_events
     WHERE symbol = ? ORDER BY ex_date`,
    symbol
  );
}

/** Every stored dividend per share, per symbol, oldest first. */
export function getAllDividendEvents(): Map<string, DividendEvent[]> {
  const rows = getDatabase().getAllSync<DividendEvent & { symbol: string }>(
    'SELECT symbol, ex_date AS exDate, amount, currency FROM dividend_events ORDER BY ex_date'
  );
  const map = new Map<string, DividendEvent[]>();
  for (const { symbol, ...event } of rows) {
    const list = map.get(symbol) ?? [];
    list.push(event);
    map.set(symbol, list);
  }
  return map;
}

/** Saves downloaded dividends; returns `true` when one of them is new or changed. */
export function storeDividendEvents(symbol: string, events: DividendEvent[]): boolean {
  const db = getDatabase();
  const known = new Map(getDividendEvents(symbol).map((event) => [event.exDate, event]));
  const changed = events.some((event) => {
    const old = known.get(event.exDate);
    return !old || old.amount !== event.amount || old.currency !== event.currency;
  });
  if (!changed) return false;
  db.withTransactionSync(() => {
    for (const event of events) {
      db.runSync(
        `INSERT INTO dividend_events (symbol, ex_date, amount, currency) VALUES (?, ?, ?, ?)
         ON CONFLICT (symbol, ex_date) DO UPDATE SET
           amount = excluded.amount, currency = excluded.currency`,
        symbol,
        event.exDate,
        event.amount,
        event.currency
      );
    }
  });
  return true;
}
