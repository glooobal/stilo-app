import { positionResult, resultBreakdown } from '../position-result';
import type { PositionValuation } from '../valuation';

const valuation = (changes: Partial<PositionValuation>): PositionValuation => ({
  price: 110,
  priceSource: 'live',
  priceTime: null,
  value: 1100,
  baseValue: 1100,
  dayChangeRatio: 0.1,
  profit: 100,
  profitRatio: 0.1,
  baseCost: 1000,
  baseProfit: 100,
  baseProfitRatio: 0.1,
  baseRealizedProfit: null,
  ...changes,
});

describe('positionResult', () => {
  it('shows the result since purchase with the included dividends', () => {
    const result = positionResult(valuation({ includedDividends: 20, resultRatio: 0.12 }), 'total');
    expect(result.amount).toBe(120);
    expect(result.ratio).toBe(0.12);
  });

  it('shows today’s change as an amount from the value', () => {
    const result = positionResult(valuation({}), 'day');
    expect(result.amount).toBeCloseTo(100, 10);
    expect(result.ratio).toBe(0.1);
  });

  it('is empty without a valuation', () => {
    expect(positionResult(undefined, 'day')).toEqual({ amount: null, ratio: null });
  });
});

describe('resultBreakdown', () => {
  it('splits the result into price, exchange rate and dividends', () => {
    // 10 shares bought for 1000 USD at 4.00 (4000 PLN); now 1100 USD at 3.60.
    const breakdown = resultBreakdown(
      valuation({
        value: 1100,
        baseValue: 3960,
        baseCost: 4000,
        baseProfit: -40,
        includedDividends: 150,
      }),
      1000
    )!;
    expect(breakdown.price).toBeCloseTo(360, 10); // +100 USD at 3.60
    expect(breakdown.currency).toBeCloseTo(-400, 10);
    expect(breakdown.dividends).toBe(150);
    expect(breakdown.total).toBeCloseTo(110, 10);
    expect(breakdown.ratio).toBeCloseTo(110 / 4000, 10);
  });
});
