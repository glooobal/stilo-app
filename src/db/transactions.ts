import { createId } from '@/lib/id';
import { adjustForSplits, splitRatio, type Split } from '@/lib/splits';
import type { Instrument, InstrumentType } from '@/market/types';

import { getDatabase, nowTimestamp } from './database';
import { notifyDataChanged } from './events';
import { getAllSplits, getSplits } from './splits';

export type TransactionSide = 'buy' | 'sell';

export type NewTransaction = {
  portfolioId: string;
  symbol: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fee: number;
  /** Currency the fee was paid in; `null` (or left out): the instrument currency. */
  feeCurrency?: string | null;
  currency: string;
  /** Trade date as `YYYY-MM-DD`. */
  tradedAt: string;
  /**
   * Rate of `currency` in `fxCurrency` (the portfolio currency) used for the
   * trade, e.g. 3.95 for USD→PLN. `null` for trades in the portfolio currency
   * or without a known rate (then the market rate of the day is used).
   */
  fxRate?: number | null;
  fxCurrency?: string | null;
  /** Where an imported trade comes from (e.g. `xtb`) and its id there. */
  source?: string | null;
  externalId?: string | null;
};

export type Transaction = NewTransaction & {
  id: string;
  createdAt: string;
};

/**
 * A transaction as calculations use it, joined with its instrument.
 *
 * `quantity` and `price` are in today's shares (adjusted for splits since
 * the trade) and `fee` is in the instrument currency. The values as entered
 * are kept in `entered*` for display and editing.
 */
export type TransactionWithInstrument = Transaction & {
  instrument: Instrument;
  /** Base currency of the transaction's portfolio. */
  portfolioCurrency: string;
  enteredQuantity: number;
  enteredPrice: number;
  /** The fee as entered, in `feeCurrency`. */
  enteredFee: number;
  /** Splits since the trade (1:1 when none). */
  splitRatio: { numerator: number; denominator: number };
};

/** Below this, a position is treated as fully sold (guards against float rounding). */
export const QUANTITY_EPSILON = 1e-9;

// Note: aggregate aliases must not reuse column names (e.g. `quantity`):
// in HAVING, SQLite resolves such a name to the column, not the alias.
type TransactionRow = {
  id: string;
  portfolio_id: string;
  symbol: string;
  side: TransactionSide;
  quantity: number;
  price: number;
  fee: number;
  fee_currency: string | null;
  currency: string;
  traded_at: string;
  created_at: string;
  fx_rate: number | null;
  fx_currency: string | null;
  source: string | null;
  external_id: string | null;
  portfolio_currency: string;
  instrument_name: string;
  instrument_exchange: string;
  instrument_exchange_name: string;
  instrument_type: InstrumentType;
  instrument_currency: string;
};

const SELECT_WITH_INSTRUMENT = `
  SELECT t.id, t.portfolio_id, t.symbol, t.side, t.quantity, t.price, t.fee, t.fee_currency,
         t.currency,
         t.traded_at, t.created_at, t.fx_rate, t.fx_currency, t.source, t.external_id,
         p.base_currency AS portfolio_currency,
         i.name AS instrument_name, i.exchange AS instrument_exchange,
         i.exchange_name AS instrument_exchange_name, i.type AS instrument_type,
         i.currency AS instrument_currency
  FROM transactions t
  JOIN instruments i ON i.symbol = t.symbol
  JOIN portfolios p ON p.id = t.portfolio_id`;

/**
 * Fee in the instrument currency. A fee paid in the portfolio currency is
 * converted at the trade's rate (only for calculations in the instrument
 * currency; calculations in the portfolio currency use it exactly).
 */
function instrumentFee(row: TransactionRow): number {
  if (!row.fee_currency || row.fee_currency === row.currency) return row.fee;
  if (row.fx_rate && row.fx_currency === row.fee_currency) return row.fee / row.fx_rate;
  return row.fee;
}

function toTransaction(row: TransactionRow, splits: Split[] | undefined): TransactionWithInstrument {
  const ratio = splitRatio(splits, row.traded_at);
  const adjusted = adjustForSplits(row.quantity, row.price, ratio);
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    symbol: row.symbol,
    side: row.side,
    quantity: adjusted.quantity,
    price: adjusted.price,
    fee: instrumentFee(row),
    feeCurrency: row.fee_currency,
    currency: row.currency,
    tradedAt: row.traded_at,
    createdAt: row.created_at,
    fxRate: row.fx_rate,
    fxCurrency: row.fx_currency,
    source: row.source,
    externalId: row.external_id,
    portfolioCurrency: row.portfolio_currency,
    enteredQuantity: row.quantity,
    enteredPrice: row.price,
    enteredFee: row.fee,
    splitRatio: ratio,
    instrument: {
      symbol: row.symbol,
      name: row.instrument_name,
      exchange: row.instrument_exchange,
      exchangeName: row.instrument_exchange_name,
      type: row.instrument_type,
      currency: row.instrument_currency,
    },
  };
}

/**
 * Active transactions, oldest first (FIFO order): of the given portfolios,
 * or of all active portfolios when none are given.
 */
export function getTransactions(portfolioIds?: string[]): TransactionWithInstrument[] {
  if (portfolioIds && portfolioIds.length === 0) return [];
  const splits = getAllSplits();
  const filter = portfolioIds
    ? `AND t.portfolio_id IN (${portfolioIds.map(() => '?').join(', ')})`
    : '';
  return getDatabase()
    .getAllSync<TransactionRow>(
      `${SELECT_WITH_INSTRUMENT}
       WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL ${filter}
       ORDER BY t.traded_at, t.created_at`,
      ...(portfolioIds ?? [])
    )
    .map((row) => toTransaction(row, splits.get(row.symbol)));
}

export function getTransaction(id: string): TransactionWithInstrument | null {
  const row = getDatabase().getFirstSync<TransactionRow>(
    `${SELECT_WITH_INSTRUMENT} WHERE t.id = ? AND t.deleted_at IS NULL`,
    id
  );
  return row ? toTransaction(row, getSplits(row.symbol)) : null;
}

/** `null` when the fee is in the instrument currency (the default). */
function feeCurrencyOf(transaction: Pick<NewTransaction, 'feeCurrency' | 'currency'>) {
  return transaction.feeCurrency && transaction.feeCurrency !== transaction.currency
    ? transaction.feeCurrency
    : null;
}

function insertTransaction(transaction: NewTransaction): string {
  const id = createId();
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    `INSERT INTO transactions
       (id, portfolio_id, symbol, side, quantity, price, fee, fee_currency, currency, traded_at,
        fx_rate, fx_currency, source, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    transaction.portfolioId,
    transaction.symbol,
    transaction.side,
    transaction.quantity,
    transaction.price,
    transaction.fee,
    feeCurrencyOf(transaction),
    transaction.currency,
    transaction.tradedAt,
    transaction.fxRate ?? null,
    transaction.fxRate != null ? (transaction.fxCurrency ?? null) : null,
    transaction.source ?? null,
    transaction.externalId ?? null,
    timestamp,
    timestamp
  );
  return id;
}

export function addTransaction(transaction: NewTransaction): string {
  const id = insertTransaction(transaction);
  notifyDataChanged();
  return id;
}

/** External ids already imported into a portfolio from a source. */
export function getImportedIds(portfolioId: string, source: string): Set<string> {
  const rows = getDatabase().getAllSync<{ external_id: string }>(
    `SELECT external_id FROM transactions
     WHERE portfolio_id = ? AND source = ? AND external_id IS NOT NULL AND deleted_at IS NULL`,
    portfolioId,
    source
  );
  return new Set(rows.map((row) => row.external_id));
}

/** Adds many transactions in one database transaction (import). */
export function addTransactions(transactions: NewTransaction[]) {
  if (transactions.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const transaction of transactions) insertTransaction(transaction);
  });
  notifyDataChanged();
}

export function updateTransaction(
  id: string,
  changes: Pick<
    NewTransaction,
    | 'portfolioId'
    | 'quantity'
    | 'price'
    | 'fee'
    | 'feeCurrency'
    | 'currency'
    | 'tradedAt'
    | 'fxRate'
    | 'fxCurrency'
  >
) {
  getDatabase().runSync(
    `UPDATE transactions
     SET portfolio_id = ?, quantity = ?, price = ?, fee = ?, fee_currency = ?, traded_at = ?,
         fx_rate = ?, fx_currency = ?, updated_at = ?
     WHERE id = ?`,
    changes.portfolioId,
    changes.quantity,
    changes.price,
    changes.fee,
    feeCurrencyOf(changes),
    changes.tradedAt,
    changes.fxRate ?? null,
    changes.fxRate != null ? (changes.fxCurrency ?? null) : null,
    nowTimestamp(),
    id
  );
  notifyDataChanged();
}

/** Soft delete, so the change can later be synced. */
export function deleteTransaction(id: string) {
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
    timestamp,
    timestamp,
    id
  );
  notifyDataChanged();
}

type SimilarKeyInput = Pick<NewTransaction, 'symbol' | 'side' | 'tradedAt' | 'quantity' | 'price'>;

/**
 * What makes two operations "the same" for the duplicate check: instrument,
 * side, day, quantity and price as entered (the fee and the time may differ
 * between a broker file and a manual entry).
 */
export function similarityKey(transaction: SimilarKeyInput): string {
  return [
    transaction.symbol,
    transaction.side,
    transaction.tradedAt,
    String(transaction.quantity),
    String(transaction.price),
  ].join('|');
}

/** Keys of the active operations of a portfolio, for the duplicate check of an import. */
export function getSimilarityKeys(portfolioId: string): Map<string, number> {
  const rows = getDatabase().getAllSync<{
    symbol: string;
    side: TransactionSide;
    traded_at: string;
    quantity: number;
    price: number;
  }>(
    `SELECT symbol, side, traded_at, quantity, price FROM transactions
     WHERE portfolio_id = ? AND deleted_at IS NULL`,
    portfolioId
  );
  const keys = new Map<string, number>();
  for (const row of rows) {
    const key = similarityKey({ ...row, tradedAt: row.traded_at });
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return keys;
}

/** An active operation like this one in the portfolio (other than `excludeId`), if any. */
export function findSimilarTransaction(
  transaction: SimilarKeyInput & { portfolioId: string },
  excludeId?: string
): { id: string } | null {
  return getDatabase().getFirstSync<{ id: string }>(
    `SELECT id FROM transactions
     WHERE portfolio_id = ? AND symbol = ? AND side = ? AND traded_at = ?
       AND quantity = ? AND price = ? AND deleted_at IS NULL AND id != ?`,
    transaction.portfolioId,
    transaction.symbol,
    transaction.side,
    transaction.tradedAt,
    transaction.quantity,
    transaction.price,
    excludeId ?? ''
  );
}
