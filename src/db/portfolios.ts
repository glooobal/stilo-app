import { createId } from '@/lib/id';

import { getDatabase, nowTimestamp } from './database';
import { notifyDataChanged } from './events';

/** Polish tax-advantaged accounts; `standard` is a regular brokerage account. */
export type AccountType = 'standard' | 'ike' | 'ikze';

export const ACCOUNT_TYPES: readonly AccountType[] = ['standard', 'ike', 'ikze'];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  standard: 'Zwykły',
  ike: 'IKE',
  ikze: 'IKZE',
};

/** Colors to choose from for the portfolio icon. */
export const PORTFOLIO_COLORS = [
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#FF3B30',
  '#FF2D55',
  '#AF52DE',
  '#5856D6',
  '#30B0C7',
  '#A2845E',
  '#8E8E93',
] as const;

export const DEFAULT_PORTFOLIO_COLOR = PORTFOLIO_COLORS[0];

/** SF Symbols to choose from for the portfolio icon. */
export const PORTFOLIO_ICONS = ['wallet.bifold.fill', 'creditcard', 'dollarsign', 'bitcoinsign'] as const;

export type PortfolioIcon = (typeof PORTFOLIO_ICONS)[number];

export const DEFAULT_PORTFOLIO_ICON: PortfolioIcon = 'wallet.bifold.fill';

export type Portfolio = {
  id: string;
  name: string;
  /** Currency the portfolio is valued in. */
  baseCurrency: string;
  accountType: AccountType;
  /** Background of the portfolio icon (hex). */
  color: string;
  icon: PortfolioIcon;
  createdAt: string;
};

export type PortfolioInput = {
  name: string;
  baseCurrency: string;
  accountType: AccountType;
  color: string;
  icon: PortfolioIcon;
};

/** Currencies a portfolio can be valued in. */
export const PORTFOLIO_CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'] as const;

type PortfolioRow = {
  id: string;
  name: string;
  base_currency: string;
  account_type: string;
  color: string | null;
  icon: string | null;
  created_at: string;
};

const COLUMNS = 'id, name, base_currency, account_type, color, icon, created_at';

function toPortfolio(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    name: row.name,
    baseCurrency: row.base_currency,
    accountType: (ACCOUNT_TYPES as readonly string[]).includes(row.account_type)
      ? (row.account_type as AccountType)
      : 'standard',
    color: row.color ?? DEFAULT_PORTFOLIO_COLOR,
    icon: (PORTFOLIO_ICONS as readonly string[]).includes(row.icon ?? '')
      ? (row.icon as PortfolioIcon)
      : DEFAULT_PORTFOLIO_ICON,
    createdAt: row.created_at,
  };
}

/** Active portfolios in the user's order (oldest first by default). */
export function listPortfolios(): Portfolio[] {
  return getDatabase()
    .getAllSync<PortfolioRow>(
      `SELECT ${COLUMNS} FROM portfolios
       WHERE deleted_at IS NULL ORDER BY sort_order, created_at`
    )
    .map(toPortfolio);
}

export function getPortfolio(id: string): Portfolio | null {
  const row = getDatabase().getFirstSync<PortfolioRow>(
    `SELECT ${COLUMNS} FROM portfolios WHERE id = ? AND deleted_at IS NULL`,
    id
  );
  return row ? toPortfolio(row) : null;
}

export function createPortfolio(input: PortfolioInput): string {
  const db = getDatabase();
  const id = createId();
  const timestamp = nowTimestamp();
  // New portfolios go to the end of the list.
  const last = db.getFirstSync<{ next: number | null }>(
    'SELECT MAX(sort_order) + 1 AS next FROM portfolios WHERE deleted_at IS NULL'
  );
  db.runSync(
    `INSERT INTO portfolios
       (id, name, base_currency, account_type, color, icon, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim(),
    input.baseCurrency,
    input.accountType,
    input.color,
    input.icon,
    last?.next ?? 0,
    timestamp,
    timestamp
  );
  notifyDataChanged();
  return id;
}

export function updatePortfolio(id: string, input: PortfolioInput) {
  getDatabase().runSync(
    `UPDATE portfolios
     SET name = ?, base_currency = ?, account_type = ?, color = ?, icon = ?, updated_at = ?
     WHERE id = ?`,
    input.name.trim(),
    input.baseCurrency,
    input.accountType,
    input.color,
    input.icon,
    nowTimestamp(),
    id
  );
  notifyDataChanged();
}

/** Saves the order of portfolios as shown in the list. */
export function reorderPortfolios(orderedIds: string[]) {
  const db = getDatabase();
  const timestamp = nowTimestamp();
  db.withTransactionSync(() => {
    orderedIds.forEach((id, index) => {
      db.runSync(
        'UPDATE portfolios SET sort_order = ?, updated_at = ? WHERE id = ?',
        index,
        timestamp,
        id
      );
    });
  });
  notifyDataChanged();
}

/** Number of active transactions in a portfolio (shown before deleting it). */
export function countPortfolioTransactions(id: string): number {
  const row = getDatabase().getFirstSync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM transactions WHERE portfolio_id = ? AND deleted_at IS NULL',
    id
  );
  return row?.count ?? 0;
}

/** Soft-deletes the portfolio together with its transactions. */
export function deletePortfolio(id: string) {
  const db = getDatabase();
  const timestamp = nowTimestamp();
  db.withTransactionSync(() => {
    db.runSync(
      'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE portfolio_id = ? AND deleted_at IS NULL',
      timestamp,
      timestamp,
      id
    );
    db.runSync(
      'UPDATE portfolios SET deleted_at = ?, updated_at = ? WHERE id = ?',
      timestamp,
      timestamp,
      id
    );
  });
  notifyDataChanged();
}
