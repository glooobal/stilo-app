import type { Instrument, InstrumentType } from '@/market/types';

import { getDatabase, nowTimestamp } from './database';

type InstrumentRow = {
  symbol: string;
  name: string;
  exchange: string;
  exchange_name: string;
  type: InstrumentType;
  currency: string;
};

function toInstrument(row: InstrumentRow): Instrument {
  return {
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    exchangeName: row.exchange_name,
    type: row.type,
    currency: row.currency,
  };
}

const COLUMNS = 'symbol, name, exchange, exchange_name, type, currency';

/** Saves an instrument the user picked so it can be found offline next time. */
export function saveInstrument(instrument: Instrument) {
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    `INSERT INTO instruments (${COLUMNS}, last_used_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (symbol) DO UPDATE SET
       name = excluded.name,
       exchange = excluded.exchange,
       exchange_name = excluded.exchange_name,
       type = excluded.type,
       currency = excluded.currency,
       last_used_at = excluded.last_used_at,
       updated_at = excluded.updated_at`,
    instrument.symbol,
    instrument.name,
    instrument.exchange,
    instrument.exchangeName,
    instrument.type,
    instrument.currency,
    timestamp,
    timestamp
  );
}

export function getRecentInstruments(limit = 10): Instrument[] {
  return getDatabase()
    .getAllSync<InstrumentRow>(
      `SELECT ${COLUMNS} FROM instruments ORDER BY last_used_at DESC LIMIT ?`,
      limit
    )
    .map(toInstrument);
}

/** Matches saved instruments by symbol or name. */
export function searchSavedInstruments(query: string, limit = 10): Instrument[] {
  const pattern = `%${query.replace(/[%_]/g, '')}%`;
  return getDatabase()
    .getAllSync<InstrumentRow>(
      `SELECT ${COLUMNS} FROM instruments
       WHERE symbol LIKE ? OR name LIKE ?
       ORDER BY (symbol LIKE ?) DESC, last_used_at DESC
       LIMIT ?`,
      pattern,
      pattern,
      `${query}%`,
      limit
    )
    .map(toInstrument);
}

export function getSavedInstrument(symbol: string): Instrument | null {
  const row = getDatabase().getFirstSync<InstrumentRow>(
    `SELECT ${COLUMNS} FROM instruments WHERE symbol = ?`,
    symbol
  );
  return row ? toInstrument(row) : null;
}
