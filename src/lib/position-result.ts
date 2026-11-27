import type { PositionValuation } from './valuation';

/** Which result is shown under a position's value. */
export const POSITION_RESULT_PERIODS = ['total', 'day'] as const;
export type PositionResultPeriod = (typeof POSITION_RESULT_PERIODS)[number];

export const POSITION_RESULT_LABELS: Record<PositionResultPeriod, string> = {
  total: 'Od zakupu',
  day: 'Dzisiaj',
};

export type PositionResult = { amount: number | null; ratio: number | null };

/**
 * The result of a position in the base currency:
 * - `total`: since purchase (price and exchange rate, with the dividends of
 *   portfolios set to include them);
 * - `day`: today's change of the price against yesterday's close.
 */
export function positionResult(
  valuation: PositionValuation | undefined,
  period: PositionResultPeriod
): PositionResult {
  if (!valuation) return { amount: null, ratio: null };
  if (period === 'day') {
    const ratio = valuation.dayChangeRatio;
    // Today's value against yesterday's: value × r / (1 + r).
    const amount =
      ratio != null && valuation.baseValue != null && ratio !== -1
        ? (valuation.baseValue * ratio) / (1 + ratio)
        : null;
    return { amount, ratio };
  }
  return {
    amount:
      valuation.baseProfit != null
        ? valuation.baseProfit + (valuation.includedDividends ?? 0)
        : null,
    ratio: valuation.resultRatio ?? valuation.baseProfitRatio ?? valuation.profitRatio ?? null,
  };
}

export type ResultBreakdown = {
  /** From the price of the instrument, at today's exchange rate. */
  price: number;
  /** From the exchange rate since the purchases (0 in the base currency). */
  currency: number;
  /** Net dividends counted with the position. */
  dividends: number;
  /** Everything together: the result shown with the position. */
  total: number;
  ratio: number | null;
};

/**
 * What the result since purchase is made of, in the base currency: the
 * price change (valued at today's rate), the exchange rate change, and the
 * dividends counted with the position. Adds up to the result on the list.
 */
export function resultBreakdown(
  valuation: PositionValuation | undefined,
  /** Cost of the shares held, in the instrument currency. */
  openCost: number
): ResultBreakdown | null {
  if (
    !valuation ||
    valuation.value == null ||
    valuation.baseValue == null ||
    valuation.baseProfit == null ||
    valuation.value === 0
  ) {
    return null;
  }
  const rate = valuation.baseValue / valuation.value;
  const price = (valuation.value - openCost) * rate;
  const dividends = valuation.includedDividends ?? 0;
  const total = valuation.baseProfit + dividends;
  return {
    price,
    currency: valuation.baseProfit - price,
    dividends,
    total,
    ratio: valuation.baseCost ? total / valuation.baseCost : null,
  };
}
