import { defaultDividendTaxRate } from '../dividend-tax';
import {
  dividendInBase,
  expectedDividends,
  planAutoDividends,
  trailingDividendPerShare,
  type Dividend,
} from '../dividends';
import { sumExact } from '../number';

const PORTFOLIOS = [
  { id: 'std', accountType: 'standard' as const },
  { id: 'ike', accountType: 'ike' as const },
];

const trade = (
  portfolioId: string,
  side: 'buy' | 'sell',
  quantity: number,
  tradedAt: string,
  symbol = 'KRU.WA'
) => ({ portfolioId, symbol, side, quantity, tradedAt });

const event = (exDate: string, amount: number, currency = 'PLN') => ({ exDate, amount, currency });

function dividend(changes: Partial<Dividend>): Dividend {
  return {
    id: 'd1',
    portfolioId: 'std',
    symbol: 'KRU.WA',
    exDate: null,
    paidAt: '2026-06-20',
    quantity: null,
    perShare: null,
    gross: 100,
    tax: 19,
    currency: 'PLN',
    fxRate: null,
    fxCurrency: null,
    source: 'manual',
    externalId: null,
    isEdited: false,
    isDeleted: false,
    ...changes,
  };
}

describe('defaultDividendTaxRate', () => {
  it('is 19% for Polish companies, nothing on IKE/IKZE', () => {
    expect(defaultDividendTaxRate('KRU.WA', 'standard')).toBe(0.19);
    expect(defaultDividendTaxRate('KRU.WA', 'ike')).toBe(0);
    expect(defaultDividendTaxRate('KRU.WA', 'ikze')).toBe(0);
  });

  it('keeps the tax at source of foreign companies, also on IKE/IKZE', () => {
    expect(defaultDividendTaxRate('AAPL', 'standard')).toBe(0.15);
    expect(defaultDividendTaxRate('AAPL', 'ike')).toBe(0.15);
    expect(defaultDividendTaxRate('ULVR.L', 'ike')).toBe(0);
  });
});

describe('planAutoDividends', () => {
  const events = new Map([['KRU.WA', [event('2026-06-10', 5)]]]);
  const base = { portfolios: PORTFOLIOS, events, today: '2026-11-25' };

  it('works out the dividend from the shares held the day before the ex-date', () => {
    const plan = planAutoDividends({
      ...base,
      transactions: [
        trade('std', 'buy', 10, '2026-01-05'),
        // Bought on the ex-date: no dividend for these shares.
        trade('std', 'buy', 4, '2026-06-10'),
      ],
      dividends: [],
    });
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0]).toMatchObject({
      quantity: 10,
      perShare: 5,
      gross: 50,
      tax: 50 * 0.19,
      currency: 'PLN',
      source: 'auto',
      externalId: 'KRU.WA:2026-06-10',
    });
  });

  it('withholds nothing on IKE for a Polish company', () => {
    const plan = planAutoDividends({
      ...base,
      transactions: [trade('ike', 'buy', 2, '2026-01-05')],
      dividends: [],
    });
    expect(plan.insert[0]).toMatchObject({ portfolioId: 'ike', gross: 10, tax: 0 });
  });

  it('leaves dividends the user changed or deleted alone', () => {
    const transactions = [trade('std', 'buy', 10, '2026-01-05')];
    for (const changes of [{ isEdited: true }, { isDeleted: true }]) {
      const plan = planAutoDividends({
        ...base,
        transactions,
        dividends: [dividend({ source: 'auto', externalId: 'KRU.WA:2026-06-10', ...changes })],
      });
      expect(plan.insert.length + plan.update.length + plan.remove.length).toBe(0);
    }
  });

  it('updates a worked-out dividend when the holding changes', () => {
    const plan = planAutoDividends({
      ...base,
      transactions: [trade('std', 'buy', 12, '2026-01-05')],
      dividends: [
        dividend({ source: 'auto', externalId: 'KRU.WA:2026-06-10', quantity: 10, perShare: 5, gross: 50, tax: 9.5 }),
      ],
    });
    expect(plan.update).toEqual([
      { id: 'd1', quantity: 12, perShare: 5, gross: 60, tax: 60 * 0.19, paidAt: '2026-07-01' },
    ]);
  });

  it('dates the dividend at the estimated payment, not the ex-date', () => {
    const plan = planAutoDividends({
      ...base,
      transactions: [trade('std', 'buy', 10, '2026-01-05')],
      dividends: [],
    });
    // GPW: about three weeks after the ex-date.
    expect(plan.insert[0].paidAt).toBe('2026-07-01');
    expect(plan.insert[0].exDate).toBe('2026-06-10');
  });

  it('waits with a dividend until it is paid', () => {
    const plan = planAutoDividends({
      ...base,
      today: '2026-06-20',
      transactions: [trade('std', 'buy', 10, '2026-01-05')],
      dividends: [],
    });
    expect(plan.insert).toHaveLength(0);
  });

  it('is replaced by an imported dividend paid for the same ex-date', () => {
    const plan = planAutoDividends({
      ...base,
      transactions: [trade('std', 'buy', 10, '2026-01-05')],
      dividends: [
        dividend({ id: 'auto', source: 'auto', externalId: 'KRU.WA:2026-06-10' }),
        dividend({ id: 'xtb', source: 'xtb', paidAt: '2026-06-24' }),
      ],
    });
    expect(plan.remove).toEqual(['auto']);
    expect(plan.insert).toHaveLength(0);
  });

  it('removes a worked-out dividend when the shares are gone', () => {
    const plan = planAutoDividends({
      ...base,
      transactions: [trade('std', 'buy', 10, '2026-07-01')],
      dividends: [dividend({ source: 'auto', externalId: 'KRU.WA:2026-06-10' })],
    });
    expect(plan.remove).toEqual(['d1']);
  });
});

describe('dividendInBase', () => {
  it('uses the rate given with the dividend, else the market rate of the day', () => {
    const usd = { gross: 10, tax: 1.5, currency: 'USD', paidAt: '2026-06-20' };
    expect(dividendInBase({ ...usd, fxRate: 4, fxCurrency: 'PLN' }, 'PLN', () => 3.9)).toEqual({
      gross: 40,
      tax: 6,
      net: 34,
    });
    expect(dividendInBase({ ...usd, fxRate: null, fxCurrency: null }, 'PLN', () => 4)?.net).toBe(34);
    expect(dividendInBase({ ...usd, fxRate: null, fxCurrency: null }, 'PLN', () => null)).toBeNull();
  });
});

describe('expected dividends', () => {
  const events = new Map([
    ['KRU.WA', [event('2025-06-10', 4), event('2026-06-10', 5), event('2026-11-01', 1)]],
  ]);

  it('adds up the dividends per share of the last 12 months', () => {
    expect(trailingDividendPerShare(events.get('KRU.WA'), '2026-11-25')).toBe(6);
  });

  it('repeats last year’s dividends a year later on the shares held now', () => {
    const expected = expectedDividends({
      portfolios: PORTFOLIOS,
      transactions: [trade('std', 'buy', 10, '2026-01-05')],
      events,
      today: '2026-11-25',
    });
    expect(expected.map((item) => [item.expectedDate, item.gross])).toEqual([
      ['2027-07-01', 50],
      ['2027-11-22', 10],
    ]);
    expect(expected[0].net).toBeCloseTo(40.5, 10);
  });

  it('lists a dividend after its ex-date until the payment, counted once', () => {
    const expected = expectedDividends({
      portfolios: PORTFOLIOS,
      transactions: [trade('std', 'buy', 10, '2026-01-05')],
      events: new Map([['KRU.WA', [event('2026-06-10', 5)]]]),
      today: '2026-06-20',
    });
    expect(expected.map((item) => [item.expectedDate, item.isDeclared])).toEqual([
      ['2026-07-01', true],
      ['2027-07-01', false],
    ]);
  });
});

describe('sumExact', () => {
  it('adds decimal amounts without binary noise', () => {
    expect(sumExact([4.24, 1.06, 9.54, 5.3])).toBe(20.14);
    expect(sumExact([0.1, 0.2])).toBe(0.3);
    expect(sumExact([-0.64, -0.16])).toBe(-0.8);
    expect(sumExact([])).toBe(0);
  });
});
