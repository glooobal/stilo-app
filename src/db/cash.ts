import type { CashOperation, CashOperationType, NewCashOperation } from '@/lib/cash';
import { createId } from '@/lib/id';

import { getDatabase, nowTimestamp } from './database';
import { notifyDataChanged } from './events';

type CashRow = {
  id: string;
  portfolio_id: string;
  type: CashOperationType;
  amount: number;
  date: string;
  note: string | null;
  source: string;
  external_id: string | null;
};

function toOperation(row: CashRow): CashOperation {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    type: row.type,
    amount: row.amount,
    date: row.date,
    note: row.note,
    source: row.source,
    externalId: row.external_id,
  };
}

const COLUMNS = 'c.id, c.portfolio_id, c.type, c.amount, c.date, c.note, c.source, c.external_id';

/**
 * Cash operations, oldest first: of the given portfolios, or of all active
 * portfolios when none are given.
 */
export function getCashOperations(portfolioIds?: string[]): CashOperation[] {
  if (portfolioIds && portfolioIds.length === 0) return [];
  const filter = portfolioIds
    ? `AND c.portfolio_id IN (${portfolioIds.map(() => '?').join(', ')})`
    : '';
  return getDatabase()
    .getAllSync<CashRow>(
      `SELECT ${COLUMNS} FROM cash_operations c
       JOIN portfolios p ON p.id = c.portfolio_id
       WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL ${filter}
       ORDER BY c.date, c.created_at`,
      ...(portfolioIds ?? [])
    )
    .map(toOperation);
}

export function getCashOperation(id: string): CashOperation | null {
  const row = getDatabase().getFirstSync<CashRow>(
    `SELECT ${COLUMNS} FROM cash_operations c WHERE c.id = ? AND c.deleted_at IS NULL`,
    id
  );
  return row ? toOperation(row) : null;
}

function insertOperation(operation: NewCashOperation): string {
  const id = createId();
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    `INSERT INTO cash_operations
       (id, portfolio_id, type, amount, date, note, source, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    operation.portfolioId,
    operation.type,
    operation.amount,
    operation.date,
    operation.note,
    operation.source,
    operation.externalId,
    timestamp,
    timestamp
  );
  return id;
}

export function addCashOperation(operation: NewCashOperation): string {
  const id = insertOperation(operation);
  notifyDataChanged();
  return id;
}

/** Adds many at once (import). */
export function addCashOperations(operations: NewCashOperation[]) {
  if (operations.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const operation of operations) insertOperation(operation);
  });
  notifyDataChanged();
}

export function updateCashOperation(
  id: string,
  changes: Pick<NewCashOperation, 'portfolioId' | 'type' | 'amount' | 'date' | 'note'>
) {
  getDatabase().runSync(
    `UPDATE cash_operations SET portfolio_id = ?, type = ?, amount = ?, date = ?, note = ?,
       updated_at = ? WHERE id = ?`,
    changes.portfolioId,
    changes.type,
    changes.amount,
    changes.date,
    changes.note,
    nowTimestamp(),
    id
  );
  notifyDataChanged();
}

export function deleteCashOperation(id: string) {
  const timestamp = nowTimestamp();
  getDatabase().runSync(
    'UPDATE cash_operations SET deleted_at = ?, updated_at = ? WHERE id = ?',
    timestamp,
    timestamp,
    id
  );
  notifyDataChanged();
}

/** External ids already imported into a portfolio from a source (also deleted ones). */
export function getImportedCashIds(portfolioId: string, source: string): Set<string> {
  const rows = getDatabase().getAllSync<{ external_id: string }>(
    `SELECT external_id FROM cash_operations
     WHERE portfolio_id = ? AND source = ? AND external_id IS NOT NULL`,
    portfolioId,
    source
  );
  return new Set(rows.map((row) => row.external_id));
}
