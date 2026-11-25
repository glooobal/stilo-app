import { calculateSaleProfit, FifoLedger, findOversell, type Trade } from '../fifo';

const buy = (quantity: number, price: number, tradedAt: string, fee = 0): Trade => ({
  side: 'buy',
  quantity,
  price,
  fee,
  tradedAt,
});
const sell = (quantity: number, price: number, tradedAt: string, fee = 0): Trade => ({
  side: 'sell',
  quantity,
  price,
  fee,
  tradedAt,
});

describe('FifoLedger', () => {
  it('sells the oldest shares first', () => {
    const ledger = new FifoLedger();
    ledger.buy(10, 100, 0);
    ledger.buy(10, 200, 0);
    const sale = ledger.sell(15, 300, 0);
    // 10 × 100 + 5 × 200 = 2000 cost, 15 × 300 = 4500 proceeds.
    expect(sale).toEqual({ profit: 2500, cost: 2000 });
    expect(ledger.quantity).toBe(5);
    expect(ledger.openCost).toBe(1000);
  });

  it('adds the buy fee to the cost and takes the sell fee from the proceeds', () => {
    const ledger = new FifoLedger();
    ledger.buy(10, 100, 10); // cost 1010
    const sale = ledger.sell(10, 110, 5); // proceeds 1095
    expect(sale?.profit).toBeCloseTo(85);
  });

  it('splits the buy fee between partial sales without losing any of it', () => {
    const ledger = new FifoLedger();
    ledger.buy(3, 10, 1); // cost 31
    const first = ledger.sell(1, 10, 0);
    const second = ledger.sell(2, 10, 0);
    expect((first?.cost ?? 0) + (second?.cost ?? 0)).toBe(31);
    expect(ledger.openCost).toBe(0);
  });

  it('refuses to sell more than is held, leaving the ledger unchanged', () => {
    const ledger = new FifoLedger();
    ledger.buy(5, 100, 0);
    expect(ledger.sell(6, 100, 0)).toBeNull();
    expect(ledger.quantity).toBe(5);
  });
});

describe('findOversell', () => {
  it('accepts a history that never sells more than held', () => {
    expect(findOversell([buy(10, 1, '2026-01-01'), sell(10, 1, '2026-02-01')])).toBeNull();
  });

  it('finds a sale before the purchase', () => {
    const early = sell(5, 1, '2026-01-01');
    expect(findOversell([early, buy(10, 1, '2026-02-01')])).toBe(early);
  });

  it('treats a buy and a sell on the same day as buy first', () => {
    expect(findOversell([sell(5, 1, '2026-01-01'), buy(5, 1, '2026-01-01')])).toBeNull();
  });
});

describe('calculateSaleProfit', () => {
  it('ignores trades after the sale date', () => {
    const history = [buy(10, 100, '2026-01-01'), buy(10, 50, '2026-03-01')];
    const result = calculateSaleProfit(history, {
      quantity: 10,
      price: 120,
      fee: 0,
      tradedAt: '2026-02-01',
    });
    expect(result?.amount).toBe(200);
    expect(result?.ratio).toBeCloseTo(0.2);
  });

  it('returns null when not enough shares are held on the date', () => {
    expect(
      calculateSaleProfit([buy(1, 100, '2026-01-01')], {
        quantity: 2,
        price: 100,
        fee: 0,
        tradedAt: '2026-02-01',
      })
    ).toBeNull();
  });
});
