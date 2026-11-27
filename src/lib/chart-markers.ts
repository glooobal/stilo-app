import { formatDecimalInput } from './number';
import { fromISODate } from './date';

export type MarkerKind = 'buy' | 'sell' | 'both' | 'dividend';

export type TradeMarker = {
  /** Point of the chart the events are drawn on. */
  index: number;
  /** Trades decide the color; a dot with only dividends is a dividend dot. */
  kind: MarkerKind;
  /** E.g. "Kupno 10 szt. · Dywidenda 12,40 zł". */
  label: string;
};

type MarkerTrade = { side: 'buy' | 'sell'; quantity: number; tradedAt: string };
/** A dividend paid, with its text for the label (e.g. "Dywidenda 12,40 zł"). */
type MarkerDividend = { paidAt: string; label: string };

const DAY_MS = 86_400_000;

/**
 * Index of the chart point a day belongs to (the close of that day on daily
 * charts, its week on long ones), or `null` when it is outside the chart.
 */
function pointIndex(times: readonly number[], date: string): number | null {
  const first = times[0];
  const last = times[times.length - 1];
  // How far from its point an event may be: the spacing of the points (a
  // day on daily charts, a week on long ones), and a long weekend at the end.
  const spacing = times.length > 1 ? (last - first) / (times.length - 1) : DAY_MS;
  const maxDistance = Math.max(4 * DAY_MS, spacing);
  // Midday of the day, so a close stamped any time that day is nearest.
  const time = fromISODate(date).getTime() + 12 * 3_600_000;
  // Before the chart starts it belongs to an earlier range.
  if (time < first - Math.max(spacing, DAY_MS) || time > last + maxDistance) return null;
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] < time) low = middle + 1;
    else high = middle;
  }
  const index =
    low > 0 && Math.abs(times[low - 1] - time) <= Math.abs(times[low] - time) ? low - 1 : low;
  return Math.abs(times[index] - time) > maxDistance ? null : index;
}

/**
 * Where the user's trades and dividends fall on a price chart. Several
 * trades on one point are summed up per side; dividends are listed after them.
 * Events outside the chart are left out.
 */
export function tradeMarkers(
  times: readonly number[],
  trades: readonly MarkerTrade[],
  dividends: readonly MarkerDividend[] = []
): TradeMarker[] {
  if (times.length === 0) return [];
  const byIndex = new Map<number, { buy: number; sell: number; dividends: string[] }>();
  const at = (index: number) => {
    const entry = byIndex.get(index) ?? { buy: 0, sell: 0, dividends: [] };
    byIndex.set(index, entry);
    return entry;
  };

  for (const trade of trades) {
    const index = pointIndex(times, trade.tradedAt);
    if (index != null) at(index)[trade.side] += trade.quantity;
  }
  for (const dividend of dividends) {
    const index = pointIndex(times, dividend.paidAt);
    if (index != null) at(index).dividends.push(dividend.label);
  }

  return [...byIndex]
    .sort(([a], [b]) => a - b)
    .map(([index, entry]) => ({
      index,
      kind:
        entry.buy > 0 && entry.sell > 0
          ? 'both'
          : entry.buy > 0
            ? 'buy'
            : entry.sell > 0
              ? 'sell'
              : 'dividend',
      label: [
        entry.buy > 0 ? `Kupno ${formatDecimalInput(entry.buy)} szt.` : null,
        entry.sell > 0 ? `Sprzedaż ${formatDecimalInput(entry.sell)} szt.` : null,
        ...entry.dividends,
      ]
        .filter(Boolean)
        .join(' · '),
    }));
}
