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

/**
 * A rate given with a trade further than this from the market rate of its
 * day cannot be right (currencies move a few percent a day at most): it is
 * a typo or a broker file read wrongly.
 */
export const MAX_RATE_DEVIATION = 0.05;

/** The given rate is too far from the market rate of the day to be real. */
export function isImplausibleRate(given: number, market: number | null): boolean {
  return market != null && market > 0 && Math.abs(given / market - 1) > MAX_RATE_DEVIATION;
}

/**
 * Rate used to convert a trade into `baseCurrency`: the one given with the
 * trade, unless it is implausible next to the market rate of its day; the
 * market rate when none is given. `null` when neither is known.
 */
export function checkedTradeRate(
  trade: TradeCurrency & { tradedAt: string },
  baseCurrency: string,
  marketFxAt: (currency: string, time: number) => number | null
): number | null {
  const given = tradeRate(trade, baseCurrency);
  if (given === 1 && trade.currency === baseCurrency) return 1;
  const market = marketFxAt(trade.currency, tradeDayEnd(trade.tradedAt));
  if (given == null) return market;
  return isImplausibleRate(given, market) ? market : given;
}
