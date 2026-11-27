import type { PriceHistory } from '@/market/types';

import { buildPositions } from '../positions';
import {
  buildPortfolioSeries,
  peakCapital,
  valuePosition,
  type MarketSnapshot,
} from '../valuation';
import { makeTransaction } from './helpers/transactions';

const day = (date: string) => Date.parse(`${date}T16:00:00Z`);

function history(symbol: string, closes: [date: string, close: number][], price?: number) {
  return {
    symbol,
    currency: 'PLN',
    price: price ?? closes.at(-1)?.[1] ?? null,
    previousClose: closes.at(-2)?.[1] ?? null,
    points: closes.map(([date, close]) => ({ time: day(date), close })),
  } satisfies PriceHistory;
}

function snapshot(histories: PriceHistory[], quotes: PriceHistory[] = histories): MarketSnapshot {
  return {
    histories: new Map(histories.map((item) => [item.symbol, item])),
    quotes: new Map(quotes.map((item) => [item.symbol, item])),
    fxHistories: new Map(),
    fxQuotes: new Map(),
  };
}

describe('peakCapital', () => {
  it('is the most money invested at once, not the sum of all purchases', () => {
    const flows = [
      { date: '2026-01-01', amount: 1000 }, // buy
      { date: '2026-02-01', amount: -1500 }, // sell
      { date: '2026-03-01', amount: 1000 }, // buy again
    ];
    expect(peakCapital(flows)).toBe(1000);
  });

  it('counts the trades of one day together', () => {
    // Sold and bought the same day: never more than 1000 in at once.
    const flows = [
      { date: '2026-01-01', amount: 1000 },
      { date: '2026-02-01', amount: 1000 },
      { date: '2026-02-01', amount: -1000 },
    ];
    expect(peakCapital(flows)).toBe(1000);
  });
});

const now = day('2026-03-10') + 3_600_000;

describe('buildPortfolioSeries', () => {

  it('values the holdings and gives the profit since purchase', () => {
    const { positions } = buildPositions([
      makeTransaction({ id: 'b', side: 'buy', quantity: 10, price: 100, fee: 5, tradedAt: '2026-03-02' }),
    ]);
    const data = snapshot([history('TEST', [['2026-03-02', 100], ['2026-03-09', 120]])]);
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now);
    expect(series.currentValue).toBe(1200);
    // 1200 − (1000 + 5).
    expect(series.currentProfit).toBe(195);
    expect(series.profitRatio).toBeCloseTo(195 / 1005, 10);
    expect(series.isIncomplete).toBe(false);
  });

  it('measures the profit against the most capital invested at once', () => {
    // Buy 10 × 100, sell for 1500, buy 10 × 100 again; now worth 1200.
    const { positions } = buildPositions([
      makeTransaction({ id: 'b1', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-03-02' }),
      makeTransaction({ id: 's1', side: 'sell', quantity: 10, price: 150, tradedAt: '2026-03-03' }),
      makeTransaction({ id: 'b2', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-03-04' }),
    ]);
    const data = snapshot([history('TEST', [['2026-03-02', 100], ['2026-03-09', 120]])]);
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now);
    // Profit: 1200 − (1000 − 1500 + 1000) = 700; the most invested at once: 1000.
    expect(series.currentProfit).toBe(700);
    expect(series.profitRatio).toBeCloseTo(0.7, 10);
    // The capital line: what is invested now (1000 − 1500 + 1000 = 500).
    expect(series.points.at(-1)?.invested).toBe(500);
    expect(series.points[0].invested).toBe(1000);
  });

  it('leaves money put in during the range out of the change', () => {
    const { positions } = buildPositions([
      makeTransaction({ id: 'b1', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-03-02' }),
      makeTransaction({ id: 'b2', side: 'buy', quantity: 10, price: 110, tradedAt: '2026-03-05' }),
    ]);
    const data = snapshot([
      history('TEST', [['2026-03-02', 100], ['2026-03-05', 110], ['2026-03-09', 120]]),
    ]);
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now);
    // Start 1000, end 2400, 1100 put in: the market made 300.
    expect(series.startValue).toBe(1000);
    expect(series.change).toBe(300);
  });

  it('keeps a position without market data in the value, at its last trade price', () => {
    const { positions } = buildPositions([
      makeTransaction({ id: 'b', side: 'buy', quantity: 4, price: 25, tradedAt: '2026-03-02', symbol: 'GONE' }),
      makeTransaction({ id: 'c', side: 'buy', quantity: 1, price: 100, tradedAt: '2026-03-02' }),
    ]);
    const data = snapshot([history('TEST', [['2026-03-02', 100], ['2026-03-09', 100]])]);
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now);
    expect(series.currentValue).toBe(200);
    // The chart does not drop the position either.
    expect(series.points.at(-2)?.value).toBe(200);
  });
});

describe('dividends in the result', () => {
  it('count towards the profit and the change of the range, not the capital', () => {
    const { positions } = buildPositions([
      makeTransaction({ id: 'b', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-03-02' }),
    ]);
    const data = snapshot([history('TEST', [['2026-03-02', 100], ['2026-03-09', 100]])]);
    const dividends = [
      { gross: 50, tax: 9.5, currency: 'PLN', fxRate: null, fxCurrency: null, paidAt: '2026-03-05' },
    ];
    const series = buildPortfolioSeries(positions, data, 'ALL', 'PLN', null, now, dividends);
    expect(series.dividends).toBe(40.5);
    expect(series.currentProfit).toBe(40.5);
    expect(series.change).toBe(40.5);
    expect(series.points.at(-1)?.invested).toBe(1000);
  });
});

describe('valuePosition', () => {
  const { positions } = buildPositions([
    makeTransaction({ id: 'b', side: 'buy', quantity: 2, price: 50, tradedAt: '2026-03-02' }),
  ]);

  it('says where the price comes from', () => {
    const live = valuePosition(positions[0], snapshot([history('TEST', [['2026-03-09', 60]])]), 'PLN');
    expect(live).toMatchObject({ price: 60, priceSource: 'live', value: 120 });

    const stored = { ...history('TEST', [['2026-03-09', 55]]), isStored: true, priceTime: day('2026-03-09') };
    expect(valuePosition(positions[0], snapshot([], [stored]), 'PLN')).toMatchObject({
      price: 55,
      priceSource: 'stored',
      priceTime: day('2026-03-09'),
    });

    expect(valuePosition(positions[0], snapshot([]), 'PLN')).toMatchObject({
      price: 50,
      priceSource: 'trade',
      value: 100,
    });
  });

  it('gives the realized profit in the base currency', () => {
    const sold = buildPositions([
      makeTransaction({ id: 'b', side: 'buy', quantity: 2, price: 50, tradedAt: '2026-03-02' }),
      makeTransaction({ id: 's', side: 'sell', quantity: 2, price: 70, tradedAt: '2026-03-05' }),
    ]).positions[0];
    expect(valuePosition(sold, snapshot([]), 'PLN').baseRealizedProfit).toBe(40);
  });
});
