/**
 * Backup file of the app: portfolios, instruments and transactions as JSON.
 * Prices are not included (they are downloaded again). This file only knows
 * the format and how to merge; reading and writing the database is in
 * `db/backup.ts`.
 */

export const BACKUP_FORMAT = '12payouts-backup';
export const BACKUP_FORMAT_VERSION = 1;

export type BackupRow = Record<string, string | number | null>;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** Database schema version the rows come from. */
  schemaVersion: number;
  appVersion: string | null;
  /** ISO time. */
  createdAt: string;
  portfolios: BackupRow[];
  instruments: BackupRow[];
  transactions: BackupRow[];
};

export class BackupError extends Error {}

/** Columns of every table in a backup, in the order they are written. */
export const BACKUP_COLUMNS = {
  portfolios: [
    'id',
    'name',
    'base_currency',
    'account_type',
    'color',
    'sort_order',
    'icon',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  instruments: [
    'symbol',
    'name',
    'exchange',
    'exchange_name',
    'type',
    'currency',
    'last_used_at',
    'updated_at',
  ],
  transactions: [
    'id',
    'portfolio_id',
    'symbol',
    'side',
    'quantity',
    'price',
    'fee',
    'fee_currency',
    'currency',
    'traded_at',
    'fx_rate',
    'fx_currency',
    'source',
    'external_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
} as const;

export type BackupTable = keyof typeof BACKUP_COLUMNS;

/** Columns that identify a row and must be present. */
const KEYS: Record<BackupTable, string> = {
  portfolios: 'id',
  instruments: 'symbol',
  transactions: 'id',
};

const REQUIRED: Record<BackupTable, string[]> = {
  portfolios: ['id', 'name', 'base_currency', 'created_at', 'updated_at'],
  instruments: ['symbol', 'name', 'currency', 'updated_at'],
  transactions: [
    'id',
    'portfolio_id',
    'symbol',
    'side',
    'quantity',
    'price',
    'currency',
    'traded_at',
    'created_at',
    'updated_at',
  ],
};

/** Values for columns a backup may lack (e.g. made before a column was added). */
const DEFAULTS: Record<BackupTable, BackupRow> = {
  portfolios: { account_type: 'standard', sort_order: 0 },
  instruments: { exchange: '', exchange_name: '', type: 'EQUITY' },
  transactions: { fee: 0 },
};

/** File name like `12payouts-kopia-2026-11-25.json`. */
export function backupFileName(date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `12payouts-kopia-${day}.json`;
}

function cleanRow(table: BackupTable, value: unknown, index: number): BackupRow {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    throw new BackupError(`Uszkodzona kopia: nieprawidłowy wiersz (${table} ${index + 1}).`);
  }
  const source = value as Record<string, unknown>;
  const row: BackupRow = {};
  for (const column of BACKUP_COLUMNS[table]) {
    const cell = source[column];
    if (cell == null) row[column] = DEFAULTS[table][column] ?? null;
    else if (typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell))) {
      row[column] = cell;
    } else {
      throw new BackupError(`Uszkodzona kopia: nieprawidłowa wartość „${column}”.`);
    }
  }
  for (const column of REQUIRED[table]) {
    if (row[column] == null || row[column] === '') {
      throw new BackupError(`Uszkodzona kopia: brak wartości „${column}”.`);
    }
  }
  if (table === 'instruments' && row.last_used_at == null) row.last_used_at = row.updated_at;
  return row;
}

/** Reads and checks a backup file; throws `BackupError` with a message for the user. */
export function parseBackup(text: string, currentSchemaVersion: number): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('To nie jest plik kopii zapasowej 12payouts.');
  }
  const object = (data ?? {}) as Record<string, unknown>;
  if (object.format !== BACKUP_FORMAT) {
    throw new BackupError('To nie jest plik kopii zapasowej 12payouts.');
  }
  if (typeof object.version !== 'number' || object.version > BACKUP_FORMAT_VERSION) {
    throw new BackupError('Ta kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację.');
  }
  const schemaVersion = typeof object.schemaVersion === 'number' ? object.schemaVersion : 0;
  if (schemaVersion > currentSchemaVersion) {
    throw new BackupError('Ta kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację.');
  }

  const rows = (table: BackupTable) => {
    const list = object[table];
    if (!Array.isArray(list)) throw new BackupError('Uszkodzona kopia: brak danych.');
    return list.map((row, index) => cleanRow(table, row, index));
  };
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: object.version,
    schemaVersion,
    appVersion: typeof object.appVersion === 'string' ? object.appVersion : null,
    createdAt: typeof object.createdAt === 'string' ? object.createdAt : '',
    portfolios: rows('portfolios'),
    instruments: rows('instruments'),
    transactions: rows('transactions'),
  };

  // Every transaction must point at a portfolio and an instrument of the backup.
  const portfolioIds = new Set(backup.portfolios.map((row) => row.id));
  const symbols = new Set(backup.instruments.map((row) => row.symbol));
  for (const row of backup.transactions) {
    if (!portfolioIds.has(row.portfolio_id) || !symbols.has(row.symbol)) {
      throw new BackupError('Uszkodzona kopia: operacja bez portfela lub instrumentu.');
    }
  }
  return backup;
}

export type RestorePlan = Record<BackupTable, { insert: BackupRow[]; update: BackupRow[] }>;

/**
 * What to change when merging a backup into the local data: rows missing
 * here are added, rows changed later in the backup than here are updated,
 * everything else stays. Nothing local is removed, so restoring is safe to
 * repeat and does not lose operations added after the backup was made.
 */
export function planRestore(
  backup: Backup,
  localUpdatedAt: Record<BackupTable, Map<string, string>>
): RestorePlan {
  const plan = {} as RestorePlan;
  for (const table of Object.keys(BACKUP_COLUMNS) as BackupTable[]) {
    const insert: BackupRow[] = [];
    const update: BackupRow[] = [];
    for (const row of backup[table]) {
      const local = localUpdatedAt[table].get(String(row[KEYS[table]]));
      if (local == null) insert.push(row);
      else if (String(row.updated_at) > local) update.push(row);
    }
    plan[table] = { insert, update };
  }
  return plan;
}

export function backupKey(table: BackupTable): string {
  return KEYS[table];
}

/** Active (not deleted) rows, for the preview. */
export function countActive(rows: BackupRow[]): number {
  return rows.filter((row) => row.deleted_at == null).length;
}
