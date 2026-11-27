import { planAutoDividends, type Dividend, type DividendSource, type NewDividend } from '@/lib/dividends';
import { createId } from '@/lib/id';
import type { Instrument, InstrumentType } from '@/market/types';

import { getDatabase, nowTimestamp } from './database';
import { getAllDividendEvents } from './dividend-events';
import { notifyDataChanged } from './events';
import { listPortfolios } from './portfolios';
import { getTransactions } from './transactions';

export type DividendWithInstrument = Dividend & {
  instrument: Instrument;
  /** Base currency of the dividend's portfolio. */
  portfolioCurrency: string;
};

type DividendRow = {
  id: string;
  portfolio_id: string;
  symbol: string;
  ex_date: string | null;
  paid_at: string;
  quantity: number | null;
  per_share: number | null;
  gross: number;
  tax: number;
  currency: string;
  fx_rate: number | null;
  fx_currency: string | null;
  source: DividendSource;
  external_id: string | null;
  is_edited: number;
  deleted_at: string | null;
};

type JoinedRow = DividendRow & {
  portfolio_currency: string;
  instrument_name: string;
  instrument_exchange: string;
  instrument_exchange_name: string;
  instrument_type: InstrumentType;
  instrument_currency: string;
};

const COLUMNS = `d.id, d.portfolio_id, d.symbol, d.ex_date, d.paid_at, d.quantity, d.per_share,
  d.gross, d.tax, d.currency, d.fx_rate, d.fx_currency, d.source, d.external_id, d.is_edited,
  d.deleted_at`;

function toDividend(row: DividendRow): Dividend {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    symbol: row.symbol,
    exDate: row.ex_date,
    paidAt: row.paid_at,
    quantity: row.quantity,
    perShare: row.per_share,
    gross: row.gross,
    tax: row.tax,
    currency: row.currency,
    fxRate: row.fx_rate,
    fxCurrency: row.fx_currency,
    source: row.source,
    externalId: row.external_id,
    isEdited: row.is_edited === 1,
    isDeleted: row.deleted_at != null,
  };
}

function toDividendWithInstrument(row: JoinedRow): DividendWithInstrument {
  return {
    ...toDividend(row),
    portfolioCurrency: row.portfolio_currency,
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

const SELECT_JOINED = `
  SELECT ${COLUMNS}, p.base_currency AS portfolio_currency,
         i.name AS instrument_name, i.exchange AS instrument_exchange,
         i.exchange_name AS instrument_exchange_name, i.type AS instrument_type,
         i.currency AS instrument_currency
  FROM dividends d
  JOIN instruments i ON i.symbol = d.symbol
  JOIN portfolios p ON p.id = d.portfolio_id`;

/**
 * Dividends received, oldest first: of the given portfolios, or of all
 * active portfolios when none are given.
 */
export function getDividends(portfolioIds?: string[]): DividendWithInstrument[] {
  if (portfolioIds && portfolioIds.length === 0) return [];
  const filter = portfolioIds
    ? `AND d.portfolio_id IN (${portfolioIds.map(() => '?').join(', ')})`
    : '';
  return getDatabase()
    .getAllSync<JoinedRow>(
      `${SELECT_JOINED}
       WHERE d.deleted_at IS NULL AND p.deleted_at IS NULL ${filter}
       ORDER BY d.paid_at, d.created_at`,
      ...(portfolioIds ?? [])
    )
    .map(toDividendWithInstrument);
}

export function getDividend(id: string): DividendWithInstrument | null {
  const row = getDatabase().getFirstSync<JoinedRow>(
    `${SELECT_JOINED} WHERE d.id = ? AND d.deleted_at IS NULL`,
    id
  );
  return row ? toDividendWithInstrument(row) : null;
}

function insertDividend(dividend: NewDividend, isEdited = false): string {
  const id = createId();
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    `INSERT INTO dividends
       (id, portfolio_id, symbol, ex_date, paid_at, quantity, per_share, gross, tax, currency,
        fx_rate, fx_currency, source, external_id, is_edited, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    dividend.portfolioId,
    dividend.symbol,
    dividend.exDate,
    dividend.paidAt,
    dividend.quantity,
    dividend.perShare,
    dividend.gross,
    dividend.tax,
    dividend.currency,
    dividend.fxRate,
    dividend.fxRate != null ? dividend.fxCurrency : null,
    dividend.source,
    dividend.externalId,
    isEdited ? 1 : 0,
    timestamp,
    timestamp
  );
  return id;
}

export function addDividend(dividend: NewDividend): string {
  const id = insertDividend(dividend);
  notifyDataChanged();
  return id;
}

export type DividendChanges = Pick<
  NewDividend,
  'portfolioId' | 'paidAt' | 'gross' | 'tax' | 'currency' | 'fxRate' | 'fxCurrency'
>;

/** Saves the user's changes; a worked-out dividend is no longer updated by the app. */
export function updateDividend(id: string, changes: DividendChanges) {
  getDatabase().runSync(
    `UPDATE dividends
     SET portfolio_id = ?, paid_at = ?, gross = ?, tax = ?, currency = ?, fx_rate = ?,
         fx_currency = ?, is_edited = 1, updated_at = ?
     WHERE id = ?`,
    changes.portfolioId,
    changes.paidAt,
    changes.gross,
    changes.tax,
    changes.currency,
    changes.fxRate,
    changes.fxRate != null ? changes.fxCurrency : null,
    nowTimestamp(),
    id
  );
  notifyDataChanged();
}

/** Soft delete; a deleted worked-out dividend is not worked out again. */
export function deleteDividend(id: string) {
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    'UPDATE dividends SET deleted_at = ?, updated_at = ? WHERE id = ?',
    timestamp,
    timestamp,
    id
  );
  notifyDataChanged();
}

/** External ids already imported into a portfolio from a source (also deleted ones). */
export function getImportedDividendIds(portfolioId: string, source: string): Set<string> {
  const rows = getDatabase().getAllSync<{ external_id: string }>(
    `SELECT external_id FROM dividends
     WHERE portfolio_id = ? AND source = ? AND external_id IS NOT NULL`,
    portfolioId,
    source
  );
  return new Set(rows.map((row) => row.external_id));
}

/** Adds many dividends at once (import). */
export function addDividends(dividends: NewDividend[]) {
  if (dividends.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const dividend of dividends) insertDividend(dividend);
  });
  syncAutoDividends();
  notifyDataChanged();
}

/**
 * Brings the dividends worked out by the app up to date with the holdings
 * and the downloaded dividends per share. Returns `true` when anything
 * changed. Cheap (local data only), so it runs after every change.
 */
export function syncAutoDividends(today = new Date()): boolean {
  const database = getDatabase();
  const rows = database.getAllSync<DividendRow>(
    `SELECT ${COLUMNS} FROM dividends d
     JOIN portfolios p ON p.id = d.portfolio_id AND p.deleted_at IS NULL`
  );
  const plan = planAutoDividends({
    portfolios: listPortfolios(),
    transactions: getTransactions(),
    events: getAllDividendEvents(),
    dividends: rows.map(toDividend),
    today: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  });
  if (plan.insert.length + plan.update.length + plan.remove.length === 0) return false;

  const timestamp = nowTimestamp();
  database.withTransactionSync(() => {
    for (const dividend of plan.insert) insertDividend(dividend);
    for (const change of plan.update) {
      database.runSync(
        `UPDATE dividends SET quantity = ?, per_share = ?, gross = ?, tax = ?, paid_at = ?,
         updated_at = ? WHERE id = ?`,
        change.quantity,
        change.perShare,
        change.gross,
        change.tax,
        change.paidAt,
        timestamp,
        change.id
      );
    }
    // Worked out by the app and no longer valid: nothing of the user's is lost.
    for (const id of plan.remove) database.runSync('DELETE FROM dividends WHERE id = ?', id);
  });
  return true;
}
