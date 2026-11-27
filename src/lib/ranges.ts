import type { ChartRange } from '@/market/types';

import { fromISODate, toISODate } from './date';

/** Order of the range buttons, shortest to longest (YTD by its length in the year). */
export const CHART_RANGES: ChartRange[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];

/** How the change for a range is described, e.g. "+2,1% dzisiaj". */
export const RANGE_CHANGE_LABELS: Record<ChartRange, string> = {
  '1D': 'dzisiaj',
  '1W': 'w ostatnim tygodniu',
  '1M': 'w ostatnim miesiącu',
  '3M': 'w ostatnich 3 miesiącach',
  '6M': 'w ostatnich 6 miesiącach',
  YTD: 'od początku roku',
  '1Y': 'w ostatnim roku',
  '5Y': 'w ostatnich 5 latach',
  ALL: 'od początku',
};

function monthsAgo(today: Date, months: number): Date {
  const start = new Date(today);
  start.setMonth(start.getMonth() - months);
  // 31 March minus one month is 3 March in JS; keep the end of the shorter month.
  if (start.getDate() !== today.getDate()) start.setDate(0);
  return start;
}

/**
 * First day of a range (`YYYY-MM-DD`), or `null` for `1D` (today's session).
 * Rolling ranges count back from today; `YTD` starts on 1 January.
 * `ALL` starts at the first trade, or a year ago when there are none.
 */
export function rangeStartDate(
  range: ChartRange,
  firstTradeDate?: string,
  today: Date = new Date()
): string | null {
  switch (range) {
    case '1D':
      return null;
    case '1W': {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return toISODate(start);
    }
    case '1M':
      return toISODate(monthsAgo(today, 1));
    case '3M':
      return toISODate(monthsAgo(today, 3));
    case '6M':
      return toISODate(monthsAgo(today, 6));
    case 'YTD':
      return `${today.getFullYear()}-01-01`;
    case '1Y':
      return toISODate(monthsAgo(today, 12));
    case '5Y':
      return toISODate(monthsAgo(today, 60));
    case 'ALL':
      return firstTradeDate ?? toISODate(monthsAgo(today, 12));
  }
}

/** Start of a range as a timestamp (local midnight), or `null` for `1D`. */
export function rangeStartTime(range: ChartRange, firstTradeDate?: string): number | null {
  const date = rangeStartDate(range, firstTradeDate);
  return date ? fromISODate(date).getTime() : null;
}
