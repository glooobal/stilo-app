import type { PriceHistory } from '@/market/types';

import { estimateCashBalance, signedCashAmount } from '../cash';
import { buildPositions } from '../positions';
import { buildPortfolioSeries, withPositionDividends, type MarketSnapshot } from '../valuation';
import { makeTransaction } from './helpers/transactions';

const day = (date: string) => Date.parse(`${date}T16:00:00Z`);
const now = day('2026-03-10') + 3_600_000;

function snapshotOf(closes: [date: string, close: number][]): MarketSnapshot {
  const history: PriceHistory = {
    symbol: 'TEST',
    currency: 'PLN',
    price: closes.at(-1)![1],
    previousClose: null,
    points: closes.map(([date, close]) => ({ time: day(date), close })),
  };
  return {
    histories: new Map([['TEST', history]]),
    quotes: new Map([['TEST', history]]),
    fxHistories: new Map(),
    fxQuotes: new Map(),
  };
}

const deposit = (amount: number, date: string, portfolioId = 'cash') => ({
  portfolioId,
  type: 'deposit' as const,
  amount,
  date,
});

describe('signedCashAmount', () => {
  it('adds deposits and interest, takes withdrawals and tax', () => {
    expect(signedCashAmount({ type: 'deposit', amount: 10 })).toBe(10);
    expect(signedCashAmount({ type: 'interest', amount: 1 })).toBe(1);
    expect(signedCashAmount({ type: 'withdrawal', amount: 10 })).toBe(-10);
    expect(signedCashAmount({ type: 'tax', amount: 1 })).toBe(-1);
  });
});

describe('a cash portfolio', () => {
  // Deposit 2000, buy 10 × 100; the shares are worth 120 now.
  const { positions } = buildPositions([
    makeTransaction({ id: 'b', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-03-02', portfolioId: 'cash' }),
  ]);
  const cash = { portfolioIds: new Set(['cash']), operations: [deposit(2000, '2026-03-01')] };
  const data = snapshotOf([['2026-03-02', 100], ['2026-03-09', 120]]);

  it('is worth its shares and its cash, with the result counted from deposits', () => {
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now, [], cash);
    expect(series.cash).toBe(1000);
    expect(series.currentValue).toBe(2200);
    expect(series.currentProfit).toBe(200);
    expect(series.profitRatio).toBeCloseTo(0.1, 10);
    expect(series.points.at(-1)?.invested).toBe(2000);
  });

  it('keeps dividends as cash (counted once)', () => {
    const dividends = [
      { gross: 50, tax: 0, currency: 'PLN', fxRate: null, fxCurrency: null, paidAt: '2026-03-05', portfolioId: 'cash' },
    ];
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now, dividends, cash);
    expect(series.cash).toBe(1050);
    expect(series.currentValue).toBe(2250);
    expect(series.currentProfit).toBe(250);
  });

  it('shows a negative balance when purchases exceed the deposits', () => {
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now, [], {
      portfolioIds: new Set(['cash']),
      operations: [deposit(400, '2026-03-01')],
    });
    expect(series.cash).toBe(-600);
    // The result is the same: 1200 − 1000 bought, whatever was deposited.
    expect(series.currentProfit).toBe(200);
  });

  it('together with a regular portfolio, counts each by its own rules', () => {
    const both = buildPositions([
      makeTransaction({ id: 'b1', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-03-02', portfolioId: 'cash' }),
      makeTransaction({ id: 'b2', side: 'buy', quantity: 5, price: 100, tradedAt: '2026-03-02', portfolioId: 'std' }),
    ]).positions;
    const series = buildPortfolioSeries(both, data, 'ALL', 'PLN', null, now, [], cash);
    // Shares 15 × 120 + cash 1000; put in: 2000 deposited + 500 bought.
    expect(series.currentValue).toBe(2800);
    expect(series.points.at(-1)?.invested).toBe(2500);
    expect(series.currentProfit).toBe(300);
  });
});

describe('estimateCashBalance', () => {
  it('follows deposits, trades and dividends up to the date', () => {
    const transactions = [
      makeTransaction({ id: 'b', side: 'buy', quantity: 2, price: 100, fee: 1, tradedAt: '2026-03-02', portfolioId: 'cash' }),
      makeTransaction({ id: 'later', side: 'buy', quantity: 1, price: 100, tradedAt: '2026-04-01', portfolioId: 'cash' }),
    ];
    const balance = estimateCashBalance({
      portfolioId: 'cash',
      baseCurrency: 'PLN',
      date: '2026-03-31',
      transactions,
      dividends: [
        { portfolioId: 'cash', paidAt: '2026-03-10', gross: 10, tax: 1.9, currency: 'PLN', fxRate: null, fxCurrency: null },
      ],
      operations: [deposit(500, '2026-03-01')],
    });
    // 500 − 201 + 8.1
    expect(balance).toBeCloseTo(307.1, 10);
  });
});

describe('withPositionDividends', () => {
  const valuation = {
    price: 120,
    priceSource: 'live' as const,
    priceTime: null,
    value: 1200,
    baseValue: 1200,
    dayChangeRatio: null,
    profit: 200,
    profitRatio: 0.2,
    baseCost: 1000,
    baseProfit: 200,
    baseProfitRatio: 0.2,
    baseRealizedProfit: 0,
  };

  it('adds the dividends to the result of the position', () => {
    expect(withPositionDividends(valuation, 50).resultRatio).toBeCloseTo(0.25, 10);
  });

  it('keeps the price-only result without dividends', () => {
    expect(withPositionDividends(valuation, 0).resultRatio).toBe(0.2);
  });
});
