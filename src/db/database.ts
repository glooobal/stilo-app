import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

// Kept from before the app was renamed to Stilo: renaming it would lose the data.
const DATABASE_NAME = '12payouts.db';

/**
 * Schema migrations, applied in order. Never edit a migration that has
 * shipped; append a new one instead. The index + 1 is stored in `user_version`.
 *
 * Records use text UUIDs and `updated_at` / `deleted_at` columns so the data
 * can later be synced to a server without a schema rewrite.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE portfolios (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    base_currency TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE instruments (
    symbol TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    exchange TEXT NOT NULL,
    exchange_name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    portfolio_id TEXT NOT NULL REFERENCES portfolios (id),
    symbol TEXT NOT NULL REFERENCES instruments (symbol),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity REAL NOT NULL CHECK (quantity > 0),
    price REAL NOT NULL CHECK (price >= 0),
    fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
    currency TEXT NOT NULL,
    traded_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE INDEX transactions_portfolio_symbol ON transactions (portfolio_id, symbol);

  CREATE TABLE search_cache (
    query TEXT PRIMARY KEY NOT NULL,
    results TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  `,
  // v2: daily closes, so charts work offline and only new days are downloaded.
  `
  CREATE TABLE price_history (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    time INTEGER NOT NULL,
    close REAL NOT NULL,
    PRIMARY KEY (symbol, date)
  ) WITHOUT ROWID;

  CREATE TABLE price_history_meta (
    symbol TEXT PRIMARY KEY NOT NULL,
    currency TEXT NOT NULL,
    start_date TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  `,
  // v3: portfolio account type (IKE/IKZE), icon color and user-defined order.
  `
  ALTER TABLE portfolios ADD COLUMN account_type TEXT NOT NULL DEFAULT 'standard';
  ALTER TABLE portfolios ADD COLUMN color TEXT;
  ALTER TABLE portfolios ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  `,
  // v4: portfolio icon (SF Symbol name).
  `
  ALTER TABLE portfolios ADD COLUMN icon TEXT;
  `,
  // v5: exchange rate of a trade in a foreign currency, entered by the user
  // (the rate the broker converted at), and the origin of imported trades.
  `
  ALTER TABLE transactions ADD COLUMN fx_rate REAL;
  ALTER TABLE transactions ADD COLUMN fx_currency TEXT;
  ALTER TABLE transactions ADD COLUMN source TEXT;
  ALTER TABLE transactions ADD COLUMN external_id TEXT;
  CREATE UNIQUE INDEX transactions_external_id
    ON transactions (portfolio_id, source, external_id)
    WHERE external_id IS NOT NULL AND deleted_at IS NULL;
  `,
  // v6: stock splits (downloaded) and the currency a commission was paid in
  // (NULL: the instrument currency), so it is kept exactly as entered.
  `
  CREATE TABLE splits (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    numerator REAL NOT NULL,
    denominator REAL NOT NULL,
    PRIMARY KEY (symbol, date)
  );
  CREATE TABLE splits_meta (
    symbol TEXT PRIMARY KEY NOT NULL,
    checked_from TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  ALTER TABLE transactions ADD COLUMN fee_currency TEXT;
  `,
  // v7: dividends. `dividends` holds what the user received (worked out from
  // the holdings, entered by hand or imported); `dividend_events` the
  // dividends per share announced by the companies (downloaded).
  `
  CREATE TABLE dividends (
    id TEXT PRIMARY KEY NOT NULL,
    portfolio_id TEXT NOT NULL REFERENCES portfolios (id),
    symbol TEXT NOT NULL REFERENCES instruments (symbol),
    ex_date TEXT,
    paid_at TEXT NOT NULL,
    quantity REAL,
    per_share REAL,
    gross REAL NOT NULL CHECK (gross >= 0),
    tax REAL NOT NULL DEFAULT 0 CHECK (tax >= 0),
    currency TEXT NOT NULL,
    fx_rate REAL,
    fx_currency TEXT,
    source TEXT NOT NULL,
    external_id TEXT,
    is_edited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX dividends_portfolio_symbol ON dividends (portfolio_id, symbol);
  -- Also over deleted rows: a dividend the user removed is not brought back.
  CREATE UNIQUE INDEX dividends_external_id
    ON dividends (portfolio_id, source, external_id)
    WHERE external_id IS NOT NULL;
  CREATE TABLE dividend_events (
    symbol TEXT NOT NULL,
    ex_date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    PRIMARY KEY (symbol, ex_date)
  );
  `,
  // v8: cash portfolios (deposits, withdrawals and interest kept as cash
  // operations; the balance follows every trade) and whether dividends
  // count towards the result of positions. Portfolio colors are no longer
  // used (the column stays, unread).
  `
  ALTER TABLE portfolios ADD COLUMN is_cash INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE portfolios ADD COLUMN include_dividends INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE cash_operations (
    id TEXT PRIMARY KEY NOT NULL,
    portfolio_id TEXT NOT NULL REFERENCES portfolios (id),
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'interest', 'tax')),
    amount REAL NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX cash_operations_portfolio ON cash_operations (portfolio_id, date);
  CREATE UNIQUE INDEX cash_operations_external_id
    ON cash_operations (portfolio_id, source, external_id)
    WHERE external_id IS NOT NULL;
  `,
  // v9: two more kinds of cash operations, so the cash of an imported
  // account matches the broker's: fees (e.g. currency conversion, stamp
  // duty) and other income (e.g. corrections). SQLite cannot change a CHECK
  // constraint, so the table is copied.
  `
  CREATE TABLE cash_operations_new (
    id TEXT PRIMARY KEY NOT NULL,
    portfolio_id TEXT NOT NULL REFERENCES portfolios (id),
    type TEXT NOT NULL
      CHECK (type IN ('deposit', 'withdrawal', 'interest', 'tax', 'fee', 'income')),
    amount REAL NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  INSERT INTO cash_operations_new
    (id, portfolio_id, type, amount, date, note, source, external_id, created_at, updated_at,
     deleted_at)
  SELECT id, portfolio_id, type, amount, date, note, source, external_id, created_at, updated_at,
     deleted_at
  FROM cash_operations;
  DROP TABLE cash_operations;
  ALTER TABLE cash_operations_new RENAME TO cash_operations;
  CREATE INDEX cash_operations_portfolio ON cash_operations (portfolio_id, date);
  CREATE UNIQUE INDEX cash_operations_external_id
    ON cash_operations (portfolio_id, source, external_id)
    WHERE external_id IS NOT NULL;
  `,
];

let database: SQLiteDatabase | null = null;

/** Schema version of this app build (stored in backups). */
export const SCHEMA_VERSION = MIGRATIONS.length;

export function getDatabase(): SQLiteDatabase {
  if (!database) {
    database = openDatabaseSync(DATABASE_NAME);
    database.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    migrate(database);
  }
  return database;
}

function migrate(db: SQLiteDatabase) {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[version]);
      db.execSync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}
