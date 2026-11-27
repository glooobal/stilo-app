import {
  BACKUP_COLUMNS,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  backupKey,
  planRestore,
  type Backup,
  type BackupRow,
  type BackupTable,
} from '@/lib/backup';

import { getDatabase, SCHEMA_VERSION } from './database';
import { notifyDataChanged } from './events';

const TABLES = Object.keys(BACKUP_COLUMNS) as BackupTable[];

/** All portfolios, instruments and transactions, also deleted ones (for a later sync). */
export function createBackup(appVersion: string | null): Backup {
  const database = getDatabase();
  const read = (table: BackupTable) =>
    database.getAllSync<BackupRow>(`SELECT ${BACKUP_COLUMNS[table].join(', ')} FROM ${table}`);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    createdAt: new Date().toISOString(),
    portfolios: read('portfolios'),
    instruments: read('instruments'),
    transactions: read('transactions'),
    dividends: read('dividends'),
    cash_operations: read('cash_operations'),
  };
}

export type RestoreResult = { added: number; updated: number };

/**
 * Merges a backup into the local data in one database transaction (all or
 * nothing). See `planRestore` for the rules.
 */
export function restoreBackup(backup: Backup): RestoreResult {
  const database = getDatabase();
  const local = {} as Record<BackupTable, Map<string, string>>;
  for (const table of TABLES) {
    const key = backupKey(table);
    const rows = database.getAllSync<{ key: string; updated_at: string }>(
      `SELECT ${key} AS key, updated_at FROM ${table}`
    );
    local[table] = new Map(rows.map((row) => [String(row.key), row.updated_at]));
  }
  const plan = planRestore(backup, local);

  let added = 0;
  let updated = 0;
  database.withTransactionSync(() => {
    // Parents first: transactions refer to portfolios and instruments.
    for (const table of [
      'instruments',
      'portfolios',
      'transactions',
      'dividends',
      'cash_operations',
    ] as const) {
      const columns = BACKUP_COLUMNS[table];
      const key = backupKey(table);
      const values = (row: BackupRow) => columns.map((column) => row[column] ?? null);

      for (const row of plan[table].insert) {
        // OR IGNORE: an operation imported in both places (same broker id)
        // under different ids is kept once.
        const result = database.runSync(
          `INSERT OR IGNORE INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          ...values(row)
        );
        added += result.changes;
      }
      const assignments = columns
        .filter((column) => column !== key)
        .map((column) => `${column} = ?`)
        .join(', ');
      for (const row of plan[table].update) {
        const result = database.runSync(
          `UPDATE OR IGNORE ${table} SET ${assignments} WHERE ${key} = ?`,
          ...columns.filter((column) => column !== key).map((column) => row[column] ?? null),
          row[key]
        );
        updated += result.changes;
      }
    }
  });
  notifyDataChanged();
  return { added, updated };
}
