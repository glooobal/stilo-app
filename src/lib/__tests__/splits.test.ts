import { buildPositions, quantityOn } from '../positions';
import {
  adjustForSplits,
  formatSplitRatio,
  quantityBeforeSplits,
  splitRatio,
  type Split,
} from '../splits';
import { makeTransaction } from './helpers/transactions';

const TEN_FOR_ONE: Split = { date: '2026-06-10', numerator: 10, denominator: 1 };
const THREE_FOR_TWO: Split = { date: '2026-09-01', numerator: 3, denominator: 2 };

describe('splitRatio', () => {
  it('combines the splits after the trade', () => {
    expect(splitRatio([TEN_FOR_ONE, THREE_FOR_TWO], '2026-01-01')).toEqual({
      numerator: 30,
      denominator: 2,
    });
    expect(splitRatio([TEN_FOR_ONE, THREE_FOR_TWO], '2026-07-01')).toEqual({
      numerator: 3,
      denominator: 2,
    });
  });

  it('does not adjust a trade on the split day (already in new shares)', () => {
    expect(splitRatio([TEN_FOR_ONE], '2026-06-10')).toEqual({ numerator: 1, denominator: 1 });
  });
});

describe('adjustForSplits', () => {
  it('multiplies the quantity and divides the price, keeping the amount', () => {
    expect(adjustForSplits(10, 1000, { numerator: 10, denominator: 1 })).toEqual({
      quantity: 100,
      price: 100,
    });
  });

  it('keeps reverse splits exact where possible', () => {
    // 1:10 reverse split: 100 shares at 2 become 10 shares at 20.
    expect(adjustForSplits(100, 2, { numerator: 1, denominator: 10 })).toEqual({
      quantity: 10,
      price: 20,
    });
  });

  it('turns today’s shares back into the shares of the trade day', () => {
    expect(quantityBeforeSplits(100, { numerator: 10, denominator: 1 })).toBe(10);
  });

  it('formats the ratio', () => {
    expect(formatSplitRatio({ numerator: 3, denominator: 2 })).toBe('3:2');
  });
});

describe('positions across a split', () => {
  // Bought 10 at 1000 before a 10:1 split, sold 50 at 120 after it.
  const transactions = [
    makeTransaction({
      id: 'b', side: 'buy', quantity: 10, price: 1000, tradedAt: '2026-01-05', splits: [TEN_FOR_ONE],
    }),
    makeTransaction({
      id: 's', side: 'sell', quantity: 50, price: 120, tradedAt: '2026-07-01', splits: [TEN_FOR_ONE],
    }),
  ];

  it('counts the shares held in today’s shares', () => {
    const [position] = buildPositions(transactions).positions;
    expect(position.quantity).toBe(50);
    expect(position.averagePrice).toBe(100);
    expect(position.openCost).toBe(5000);
  });

  it('does not see the sale after the split as overselling', () => {
    expect(quantityOn(transactions, '2026-08-01')).toBe(50);
  });

  it('gives the real result of the sale', () => {
    // 50 × 120 − 50 × 100 = 1000.
    expect(buildPositions(transactions).saleResults.get('s')?.amount).toBe(1000);
  });
});
