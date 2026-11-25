/**
 * Stock splits. A 10:1 split turns one share into ten at a tenth of the
 * price. Market data prices are adjusted for splits back in time, so trades
 * made before a split are counted in today's shares: quantity × ratio,
 * price ÷ ratio (the amount paid stays the same). Saved transactions keep
 * the values as entered; the adjustment happens in calculations only.
 */

export type Split = {
  /** First trading day after the split, `YYYY-MM-DD`. */
  date: string;
  /** New shares for `denominator` old ones: 10 and 1 for a 10:1 split. */
  numerator: number;
  denominator: number;
};

/** Combined ratio of the splits after `tradedAt`, as a fraction (no division yet). */
export function splitRatio(
  splits: readonly Split[] | undefined,
  tradedAt: string
): { numerator: number; denominator: number } {
  let numerator = 1;
  let denominator = 1;
  for (const split of splits ?? []) {
    // A trade on the split day is already in the new shares.
    if (split.date <= tradedAt) continue;
    numerator *= split.numerator;
    denominator *= split.denominator;
  }
  return { numerator, denominator };
}

export function isUnsplit(ratio: { numerator: number; denominator: number }): boolean {
  return ratio.numerator === ratio.denominator;
}

/**
 * Quantity and price of a trade in today's shares. Multiplies before it
 * divides, so whole ratios (2:1, 10:1) stay exact.
 */
export function adjustForSplits(
  quantity: number,
  price: number,
  ratio: { numerator: number; denominator: number }
): { quantity: number; price: number } {
  if (isUnsplit(ratio)) return { quantity, price };
  return {
    quantity: (quantity * ratio.numerator) / ratio.denominator,
    price: (price * ratio.denominator) / ratio.numerator,
  };
}

/** Quantity in today's shares → in the shares of the trade's day. */
export function quantityBeforeSplits(
  quantity: number,
  ratio: { numerator: number; denominator: number }
): number {
  if (isUnsplit(ratio)) return quantity;
  return (quantity * ratio.denominator) / ratio.numerator;
}

/** "10:1" for display. */
export function formatSplitRatio(ratio: { numerator: number; denominator: number }): string {
  const format = (value: number) => String(Number(value.toPrecision(15))).replace('.', ',');
  return `${format(ratio.numerator)}:${format(ratio.denominator)}`;
}
