import type { TransactionWithInstrument } from '@/db/transactions';
import type { Instrument } from '@/market/types';

import { FifoLedger, sortTrades } from './fifo';
import { convertTrade, tradeDayEnd, tradeRate } from './fx';

const EPSILON = 1e-9;

export type Position = {
  instrument: Instrument;
  /** Shares currently held. */
  quantity: number;
  /** FIFO cost of the shares held, in the instrument currency, with fees. */
  openCost: number;
  averagePrice: number;
  /** Profit of all sales, in the instrument currency. */
  realizedProfit: number;
  transactions: TransactionWithInstrument[];
};

/** Realized result of one sale (FIFO), in the instrument currency. */
export type SaleResult = {
  amount: number;
  /** Relative to the cost of the shares sold. */
  ratio: number;
  /**
   * The same in the portfolio currency, with the exchange rates of the
   * trades; set for foreign-currency sales whose trades all have a rate.
   */
  base?: { amount: number; ratio: number; currency: string };
};

/**
 * Positions per instrument, including closed ones (quantity 0), and the
 * realized result of every sale keyed by transaction id.
 *
 * FIFO runs separately in every portfolio (a sale only consumes purchases
 * from its own portfolio, like at a broker); positions of the same instrument
 * in several portfolios are then added together.
 */
export function buildPositions(transactions: TransactionWithInstrument[]): {
  positions: Position[];
  saleResults: Map<string, SaleResult>;
} {
  const saleResults = new Map<string, SaleResult>();

  const groups = new Map<string, TransactionWithInstrument[]>();
  for (const transaction of transactions) {
    const key = `${transaction.portfolioId}|${transaction.symbol}`;
    const list = groups.get(key) ?? [];
    list.push(transaction);
    groups.set(key, list);
  }

  const bySymbol = new Map<string, Position>();
  for (const list of groups.values()) {
    const sorted = sortTrades(list);
    const ledger = new FifoLedger();
    // The same trades in the portfolio currency, as long as every rate is known.
    const portfolioCurrency = sorted[0].portfolioCurrency;
    const isForeign = sorted[0].currency !== portfolioCurrency;
    let baseLedger: FifoLedger | null = isForeign ? new FifoLedger() : null;
    for (const trade of sorted) {
      const sale = ledger.apply(trade);
      const rate = baseLedger ? tradeRate(trade, portfolioCurrency) : null;
      if (baseLedger && rate == null) baseLedger = null;
      const baseSale =
        baseLedger && rate != null
          ? baseLedger.apply(convertTrade(trade, rate, portfolioCurrency))
          : null;
      if (sale && sale.cost > 0) {
        saleResults.set(trade.id, {
          amount: sale.profit,
          ratio: sale.profit / sale.cost,
          base:
            baseSale && baseSale.cost > 0
              ? {
                  amount: baseSale.profit,
                  ratio: baseSale.profit / baseSale.cost,
                  currency: portfolioCurrency,
                }
              : undefined,
        });
      }
    }

    const quantity = ledger.quantity > EPSILON ? ledger.quantity : 0;
    const openCost = quantity ? ledger.openCost : 0;
    const existing = bySymbol.get(sorted[0].symbol);
    if (existing) {
      existing.quantity += quantity;
      existing.openCost += openCost;
      existing.realizedProfit += ledger.realizedProfit;
      existing.transactions = sortTrades([...existing.transactions, ...sorted]);
    } else {
      bySymbol.set(sorted[0].symbol, {
        instrument: sorted[0].instrument,
        quantity,
        openCost,
        averagePrice: 0,
        realizedProfit: ledger.realizedProfit,
        transactions: sorted,
      });
    }
  }

  const positions = [...bySymbol.values()];
  for (const position of positions) {
    position.averagePrice = position.quantity > 0 ? position.openCost / position.quantity : 0;
  }
  positions.sort((a, b) => a.instrument.name.localeCompare(b.instrument.name, 'pl'));
  return { positions, saleResults };
}

/** Shares of one instrument held at the end of `date` (`YYYY-MM-DD`). */
export function quantityOn(transactions: TransactionWithInstrument[], date: string): number {
  let quantity = 0;
  for (const transaction of transactions) {
    if (transaction.tradedAt > date) continue;
    quantity += transaction.side === 'buy' ? transaction.quantity : -transaction.quantity;
  }
  return quantity > EPSILON ? quantity : 0;
}

/**
 * The position in `baseCurrency`, FIFO per portfolio: the cost of the shares
 * held and the profit of all sales. Every trade counts at the rate it was
 * made at (entered with the trade, else the market rate of its day), so a
 * change of the exchange rate is part of the result. `null` when a rate is
 * unknown.
 */
export function baseLedgerTotals(
  transactions: TransactionWithInstrument[],
  baseCurrency: string,
  marketFxAt: (currency: string, time: number) => number | null
): { openCost: number; realizedProfit: number } | null {
  const groups = new Map<string, TransactionWithInstrument[]>();
  for (const transaction of transactions) {
    const list = groups.get(transaction.portfolioId) ?? [];
    list.push(transaction);
    groups.set(transaction.portfolioId, list);
  }

  let openCost = 0;
  let realizedProfit = 0;
  for (const list of groups.values()) {
    const ledger = new FifoLedger();
    for (const trade of sortTrades(list)) {
      const rate =
        tradeRate(trade, baseCurrency) ??
        marketFxAt(trade.currency, tradeDayEnd(trade.tradedAt));
      if (rate == null) return null;
      ledger.apply(convertTrade(trade, rate, baseCurrency));
    }
    if (ledger.quantity > EPSILON) openCost += ledger.openCost;
    realizedProfit += ledger.realizedProfit;
  }
  return { openCost, realizedProfit };
}

/** FIFO cost of the shares held in `baseCurrency` (see `baseLedgerTotals`). */
export function baseOpenCost(
  transactions: TransactionWithInstrument[],
  baseCurrency: string,
  marketFxAt: (currency: string, time: number) => number | null
): number | null {
  return baseLedgerTotals(transactions, baseCurrency, marketFxAt)?.openCost ?? null;
}
