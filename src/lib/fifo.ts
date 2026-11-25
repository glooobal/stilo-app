import type { TransactionSide } from '@/db/transactions';

const EPSILON = 1e-9;

export type Trade = {
  side: TransactionSide;
  quantity: number;
  price: number;
  fee: number;
  /** `YYYY-MM-DD` */
  tradedAt: string;
};

type Lot = {
  /** Shares of the purchase still held. */
  quantity: number;
  price: number;
  /** The part of the buy fee that belongs to the shares still held. */
  fee: number;
};

/**
 * Takes `taken` shares out of a lot and returns their cost with their part
 * of the buy fee. A whole lot costs exactly price × quantity + fee: the fee
 * is not divided per share first, so nothing is lost on the way.
 */
function takeFromLot(lot: Lot, taken: number): number {
  if (taken >= lot.quantity) {
    const cost = lot.price * lot.quantity + lot.fee;
    lot.quantity = 0;
    lot.fee = 0;
    return cost;
  }
  const fee = (lot.fee * taken) / lot.quantity;
  lot.quantity -= taken;
  lot.fee -= fee;
  return taken * lot.price + fee;
}

/**
 * FIFO ledger (first in, first out): sales consume the oldest purchases
 * first. This is the method required by Polish tax law, so results will
 * match a future tax report. Buy fees are part of the cost, sell fees reduce
 * the proceeds.
 */
export class FifoLedger {
  private lots: Lot[] = [];
  /** Realized profit of all sales so far. */
  realizedProfit = 0;

  get quantity(): number {
    return this.lots.reduce((sum, lot) => sum + lot.quantity, 0);
  }

  /** Cost basis of the shares still held. */
  get openCost(): number {
    return this.lots.reduce((sum, lot) => sum + lot.price * lot.quantity + lot.fee, 0);
  }

  buy(quantity: number, price: number, fee: number) {
    this.lots.push({ quantity, price, fee });
  }

  /**
   * Removes shares FIFO and returns the realized profit of this sale, or
   * `null` (leaving the ledger unchanged) when there are not enough shares.
   */
  sell(quantity: number, price: number, fee: number): { profit: number; cost: number } | null {
    if (quantity > this.quantity + EPSILON) return null;

    let remaining = quantity;
    let cost = 0;
    while (remaining > EPSILON && this.lots.length > 0) {
      const lot = this.lots[0];
      const taken = Math.min(lot.quantity, remaining);
      cost += takeFromLot(lot, taken);
      remaining -= taken;
      if (lot.quantity <= EPSILON) this.lots.shift();
    }
    const profit = quantity * price - fee - cost;
    this.realizedProfit += profit;
    return { profit, cost };
  }

  apply(trade: Trade) {
    return trade.side === 'buy'
      ? (this.buy(trade.quantity, trade.price, trade.fee), null)
      : this.sell(trade.quantity, trade.price, trade.fee);
  }
}

/** Sorts trades chronologically; on the same day, buys before sells. */
export function sortTrades<T extends Trade>(trades: T[]): T[] {
  return [...trades].sort((a, b) => {
    if (a.tradedAt !== b.tradedAt) return a.tradedAt < b.tradedAt ? -1 : 1;
    if (a.side !== b.side) return a.side === 'buy' ? -1 : 1;
    return 0;
  });
}

/**
 * Checks that a set of trades never sells more than was held at that date.
 * Returns the first offending trade, or `null` when the history is valid.
 */
export function findOversell<T extends Trade>(trades: T[]): T | null {
  const ledger = new FifoLedger();
  for (const trade of sortTrades(trades)) {
    if (trade.side === 'buy') {
      ledger.buy(trade.quantity, trade.price, trade.fee);
    } else if (ledger.sell(trade.quantity, trade.price, trade.fee) == null) {
      return trade;
    }
  }
  return null;
}

/**
 * Realized profit of one sale against the history before it. Returns `null`
 * when the history does not hold enough shares on the sale date.
 */
export function calculateSaleProfit(
  history: Trade[],
  sale: Omit<Trade, 'side'>
): { amount: number; ratio: number } | null {
  const ledger = new FifoLedger();
  for (const trade of sortTrades(history)) {
    if (trade.tradedAt > sale.tradedAt) break;
    ledger.apply(trade);
  }
  const result = ledger.sell(sale.quantity, sale.price, sale.fee);
  if (!result || result.cost <= 0) return null;
  return { amount: result.profit, ratio: result.profit / result.cost };
}
