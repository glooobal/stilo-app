import { positionResult, type PositionResultPeriod } from './position-result';
import type { Position } from './positions';
import type { PositionValuation } from './valuation';

export const POSITION_SORTS = ['value', 'result', 'share', 'name'] as const;
export type PositionSort = (typeof POSITION_SORTS)[number];

export const POSITION_SORT_LABELS: Record<PositionSort, string> = {
  value: 'Wartość',
  result: 'Wynik',
  share: 'Udział',
  name: 'Nazwa',
};

/** Share of each position in the portfolio value (base currency), 0–1. */
export function portfolioShares(
  positions: Position[],
  valuations: Map<string, PositionValuation>
): Map<string, number> {
  let total = 0;
  for (const position of positions) {
    total += valuations.get(position.instrument.symbol)?.baseValue ?? 0;
  }
  const shares = new Map<string, number>();
  if (total <= 0) return shares;
  for (const position of positions) {
    const value = valuations.get(position.instrument.symbol)?.baseValue;
    if (value != null) shares.set(position.instrument.symbol, value / total);
  }
  return shares;
}

/**
 * Sorts positions; numbers go from highest to lowest and positions without
 * a price yet go last.
 */
export function sortPositions(
  positions: Position[],
  sort: PositionSort,
  valuations: Map<string, PositionValuation>,
  /** Result sorting follows the result shown with the positions. */
  resultPeriod: PositionResultPeriod = 'total'
): Position[] {
  if (sort === 'name') {
    return [...positions].sort((a, b) =>
      a.instrument.name.localeCompare(b.instrument.name, 'pl')
    );
  }
  const key = (position: Position): number | null => {
    const valuation = valuations.get(position.instrument.symbol);
    if (sort === 'result') {
      return positionResult(valuation, resultPeriod).ratio;
    }
    // Value and share both compare the value in the base currency, so
    // positions in different currencies are ordered correctly.
    return valuation?.baseValue ?? null;
  };
  return [...positions].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return kb - ka;
  });
}
