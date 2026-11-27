export type CashOperationType = 'deposit' | 'withdrawal' | 'interest' | 'tax';

export const CASH_OPERATION_TYPES: readonly CashOperationType[] = [
  'deposit',
  'withdrawal',
  'interest',
  'tax',
];

export const CASH_OPERATION_LABELS: Record<CashOperationType, string> = {
  deposit: 'Wpłata',
  withdrawal: 'Wypłata',
  interest: 'Odsetki',
  tax: 'Podatek od odsetek',
};

/** Money in or out of a cash portfolio, in the portfolio currency. */
export type CashOperation = {
  id: string;
  portfolioId: string;
  type: CashOperationType;
  /** Always positive; the type says the direction. */
  amount: number;
  /** `YYYY-MM-DD` */
  date: string;
  note: string | null;
  source: string;
  externalId: string | null;
};

export type NewCashOperation = Omit<CashOperation, 'id'>;

/** Amount with its direction: deposits and interest +, withdrawals and tax −. */
export function signedCashAmount(operation: Pick<CashOperation, 'type' | 'amount'>): number {
  return operation.type === 'deposit' || operation.type === 'interest'
    ? operation.amount
    : -operation.amount;
}

/** Deposits and withdrawals are the money put in; interest and tax are a result. */
export function isCapitalOperation(operation: Pick<CashOperation, 'type'>): boolean {
  return operation.type === 'deposit' || operation.type === 'withdrawal';
}

type BalanceTrade = {
  id: string;
  portfolioId: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  tradedAt: string;
  currency: string;
  fxRate?: number | null;
  fxCurrency?: string | null;
  feeCurrency?: string | null;
  enteredFee?: number;
};

type BalanceDividend = {
  portfolioId: string;
  paidAt: string;
  gross: number;
  tax: number;
  currency: string;
  fxRate: number | null;
  fxCurrency: string | null;
};

/**
 * Cash of a cash portfolio at the end of `date`, from the data alone (no
 * market rates): trades and dividends in another currency count at the
 * rate saved with them and are left out without one. For hints in forms;
 * the portfolio screens use the full valuation.
 */
export function estimateCashBalance(input: {
  portfolioId: string;
  baseCurrency: string;
  date: string;
  transactions: readonly BalanceTrade[];
  dividends: readonly BalanceDividend[];
  operations: readonly Pick<CashOperation, 'portfolioId' | 'type' | 'amount' | 'date'>[];
  /** A transaction being edited, left out. */
  excludeId?: string;
}): number {
  const { portfolioId, baseCurrency, date } = input;
  let balance = 0;
  for (const operation of input.operations) {
    if (operation.portfolioId === portfolioId && operation.date <= date) {
      balance += signedCashAmount(operation);
    }
  }
  for (const trade of input.transactions) {
    if (trade.portfolioId !== portfolioId || trade.tradedAt > date || trade.id === input.excludeId) {
      continue;
    }
    const rate =
      trade.currency === baseCurrency
        ? 1
        : trade.fxRate && trade.fxCurrency === baseCurrency
          ? trade.fxRate
          : null;
    if (rate == null) continue;
    const fee =
      trade.feeCurrency === baseCurrency && trade.enteredFee != null
        ? trade.enteredFee
        : trade.fee * rate;
    const gross = trade.quantity * trade.price * rate;
    balance += trade.side === 'buy' ? -(gross + fee) : gross - fee;
  }
  for (const dividend of input.dividends) {
    if (dividend.portfolioId !== portfolioId || dividend.paidAt > date) continue;
    const rate =
      dividend.currency === baseCurrency
        ? 1
        : dividend.fxRate && dividend.fxCurrency === baseCurrency
          ? dividend.fxRate
          : null;
    if (rate != null) balance += (dividend.gross - dividend.tax) * rate;
  }
  return balance;
}
