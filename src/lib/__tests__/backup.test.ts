import {
  BACKUP_FORMAT,
  BackupError,
  parseBackup,
  planRestore,
  type Backup,
  type BackupTable,
} from '../backup';

const portfolio = {
  id: 'p1',
  name: 'IKE',
  base_currency: 'PLN',
  account_type: 'ike',
  color: '#007AFF',
  sort_order: 0,
  icon: 'creditcard',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};
const instrument = {
  symbol: 'KRU.WA',
  name: 'Kruk',
  exchange: 'WSE',
  exchange_name: 'Warsaw',
  type: 'EQUITY',
  currency: 'PLN',
  last_used_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const transaction = {
  id: 't1',
  portfolio_id: 'p1',
  symbol: 'KRU.WA',
  side: 'buy',
  quantity: 3,
  price: 396.4,
  fee: 0,
  currency: 'PLN',
  traded_at: '2026-06-08',
  fx_rate: null,
  fx_currency: null,
  source: 'xtb',
  external_id: '2620520178:buy',
  created_at: '2026-06-08T12:00:00Z',
  updated_at: '2026-06-08T12:00:00Z',
  deleted_at: null,
};

function file(changes: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    schemaVersion: 5,
    appVersion: '1.0.0',
    createdAt: '2026-11-25T10:00:00Z',
    portfolios: [portfolio],
    instruments: [instrument],
    transactions: [transaction],
    ...changes,
  });
}

describe('parseBackup', () => {
  it('reads a valid backup', () => {
    const backup = parseBackup(file(), 5);
    expect(backup.portfolios).toHaveLength(1);
    expect(backup.transactions[0]).toMatchObject({ id: 't1', quantity: 3 });
  });

  it('rejects other files', () => {
    expect(() => parseBackup('not json', 5)).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }), 5)).toThrow(BackupError);
  });

  it('rejects a backup from a newer app version', () => {
    expect(() => parseBackup(file({ schemaVersion: 99 }), 5)).toThrow(/nowszej/);
  });

  it('rejects an operation without its portfolio', () => {
    expect(() => parseBackup(file({ portfolios: [] }), 5)).toThrow(BackupError);
  });

  it('reads a backup made before dividends as having none', () => {
    expect(parseBackup(file(), 5).dividends).toEqual([]);
  });

  it('fills columns an older backup lacks', () => {
    const { account_type: _, ...old } = portfolio;
    const backup = parseBackup(file({ portfolios: [old] }), 5);
    expect(backup.portfolios[0].account_type).toBe('standard');
  });
});

describe('planRestore', () => {
  const empty = (): Record<BackupTable, Map<string, string>> => ({
    portfolios: new Map(),
    instruments: new Map(),
    transactions: new Map(),
    dividends: new Map(),
    cash_operations: new Map(),
  });

  it('adds everything to an empty app', () => {
    const plan = planRestore(parseBackup(file(), 5), empty());
    expect(plan.transactions.insert).toHaveLength(1);
    expect(plan.portfolios.insert).toHaveLength(1);
  });

  it('updates only rows changed later in the backup', () => {
    const local = empty();
    local.transactions.set('t1', '2026-01-01T00:00:00Z'); // older than the backup
    local.portfolios.set('p1', '2026-12-01T00:00:00Z'); // newer here: keep it
    const plan = planRestore(parseBackup(file(), 5) as Backup, local);
    expect(plan.transactions.update).toHaveLength(1);
    expect(plan.portfolios.update).toHaveLength(0);
    expect(plan.portfolios.insert).toHaveLength(0);
  });
});

describe('legacy backups', () => {
  it('reads backups made under the old app name', () => {
    expect(() => parseBackup(JSON.stringify({ format: '12payouts-backup', version: 99 }), 1)).toThrow(
      'nowszej wersji'
    );
  });
});
