import { convertTrade, tradeRate } from '../fx';
import { baseLedgerTotals, baseOpenCost, buildPositions } from '../positions';
import { makeTransaction } from './helpers/transactions';

function trade(
  id: string,
  side: 'buy' | 'sell',
  quantity: number,
  price: number,
  tradedAt: string,
  fxRate: number | null
) {
  return makeTransaction({
    id,
    side,
    quantity,
    price,
    tradedAt,
    fxRate,
    symbol: 'AAPL',
    currency: 'USD',
  });
}

describe('tradeRate', () => {
  it('is 1 in the same currency', () => {
    expect(tradeRate({ currency: 'PLN' }, 'PLN')).toBe(1);
  });

  it('uses the rate entered for that currency only', () => {
    const usdInPln = { currency: 'USD', fxRate: 4, fxCurrency: 'PLN' };
    expect(tradeRate(usdInPln, 'PLN')).toBe(4);
    expect(tradeRate(usdInPln, 'EUR')).toBeNull();
  });
});

describe('sale result in the portfolio currency', () => {
  // Bought at 4.00 PLN/USD, sold at 3.80: +50 USD, but only +90 PLN.
  const transactions = [
    trade('b', 'buy', 10, 100, '2026-01-02', 4.0),
    trade('s', 'sell', 5, 110, '2026-02-02', 3.8),
  ];

  it('counts the exchange rates of both trades', () => {
    const { saleResults } = buildPositions(transactions);
    const result = saleResults.get('s');
    expect(result?.amount).toBe(50);
    expect(result?.base?.currency).toBe('PLN');
    expect(result?.base?.amount).toBeCloseTo(90);
    expect(result?.base?.ratio).toBeCloseTo(0.045);
  });

  it('gives no portfolio-currency result when a purchase has no rate', () => {
    const { saleResults } = buildPositions([
      trade('b', 'buy', 10, 100, '2026-01-02', null),
      trade('s', 'sell', 5, 110, '2026-02-02', 3.8),
    ]);
    expect(saleResults.get('s')?.base).toBeUndefined();
  });
});

describe('baseOpenCost', () => {
  const transactions = [
    trade('b', 'buy', 10, 100, '2026-01-02', 4.0),
    trade('s', 'sell', 5, 110, '2026-02-02', 3.8),
  ];

  it('values the shares held at the rate they were bought at', () => {
    expect(baseOpenCost(transactions, 'PLN', () => null)).toBe(2000);
  });

  it('falls back to the market rate for another currency', () => {
    expect(baseOpenCost(transactions, 'EUR', () => 0.9)).toBeCloseTo(450);
  });

  it('is null when a rate is unknown', () => {
    expect(baseOpenCost(transactions, 'EUR', () => null)).toBeNull();
  });
});

describe('a commission paid in the portfolio currency', () => {
  // 10 × 100 USD at 4.00, commission 10 PLN; sold 10 × 110 USD at 4.00, commission 10 PLN.
  const transactions = [
    makeTransaction({
      id: 'b', side: 'buy', quantity: 10, price: 100, tradedAt: '2026-01-02',
      currency: 'USD', fxRate: 4, fee: 10, feeCurrency: 'PLN',
    }),
    makeTransaction({
      id: 's', side: 'sell', quantity: 10, price: 110, tradedAt: '2026-02-02',
      currency: 'USD', fxRate: 4, fee: 10, feeCurrency: 'PLN',
    }),
  ];

  it('is used exactly, not converted there and back', () => {
    const converted = convertTrade(transactions[0], 4, 'PLN');
    expect(converted.fee).toBe(10);
    expect(converted.price).toBe(400);
  });

  it('counts in the realized result in the portfolio currency', () => {
    // 4400 − 10 − (4000 + 10) = 380 PLN.
    expect(baseLedgerTotals(transactions, 'PLN', () => null)).toEqual({
      openCost: 0,
      realizedProfit: 380,
    });
    expect(buildPositions(transactions).saleResults.get('s')?.base?.amount).toBe(380);
  });

  it('is converted into the instrument currency at the trade rate', () => {
    // 10 PLN at 4 PLN/USD = 2.5 USD on each side: 1100 − 2.5 − 1002.5 = 95 USD.
    expect(buildPositions(transactions).saleResults.get('s')?.amount).toBe(95);
  });
});
