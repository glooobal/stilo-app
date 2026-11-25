import type { Trade } from './fifo';

type TradeCurrency = {
  currency: string;
  fxRate?: number | null;
  fxCurrency?: string | null;
};

/**
 * Rate the trade was converted at into `baseCurrency`: 1 for the same
 * currency, the rate entered with the trade when it was given for that
 * currency, otherwise `null` (the caller may fall back to the market rate).
 */
export function tradeRate(trade: TradeCurrency, baseCurrency: string): number | null {
  if (trade.currency === baseCurrency) return 1;
  if (trade.fxRate != null && trade.fxRate > 0 && trade.fxCurrency === baseCurrency) {
    return trade.fxRate;
  }
  return null;
}

type FeeSource = { feeCurrency?: string | null; enteredFee?: number };

/**
 * The trade in `currency`: its price converted at `rate`. A fee that was paid
 * in `currency` (e.g. a commission charged in PLN) is used exactly as
 * entered instead of being converted there and back.
 */
export function convertTrade<T extends Trade & FeeSource>(
  trade: T,
  rate: number,
  currency?: string
): T {
  const fee =
    currency != null && trade.feeCurrency === currency && trade.enteredFee != null
      ? trade.enteredFee
      : trade.fee * rate;
  return { ...trade, price: trade.price * rate, fee };
}

/** End of the trade day (ms), to look up the market rate of that day. */
export function tradeDayEnd(tradedAt: string): number {
  const [year, month, day] = tradedAt.split('-').map(Number);
  return new Date(year, month - 1, day).getTime() + 86_399_000;
}
