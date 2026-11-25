import type { ChartRange } from '@/market/types';

import { fromISODate, toISODate } from './date';

/** Order of the range segments: shortest to longest, the current year after "Rok". */
export const CHART_RANGES: ChartRange[] = ['1D', '1M', '1Y', 'YTD', 'ALL'];

/** How the change for a range is described, e.g. "+2,1% dzisiaj". */
export const RANGE_CHANGE_LABELS: Record<ChartRange, string> = {
  '1D': 'dzisiaj',
  '1M': 'w ostatnim miesiącu',
  YTD: 'od początku roku',
  '1Y': 'w ostatnim roku',
  ALL: 'od początku',
};

/**
 * First day of a range (`YYYY-MM-DD`), or `null` for `1D` (today's session).
 * `ALL` starts at the first trade, or a year ago when there are none.
 */
export function rangeStartDate(range: ChartRange, firstTradeDate?: string): string | null {
  const today = new Date();
  switch (range) {
    case '1D':
      return null;
    case '1M': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 1);
      return toISODate(start);
    }
    case 'YTD':
      return `${today.getFullYear()}-01-01`;
    case '1Y': {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      return toISODate(start);
    }
    case 'ALL': {
      if (firstTradeDate) return firstTradeDate;
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      return toISODate(start);
    }
  }
}

/** Start of a range as a timestamp (local midnight), or `null` for `1D`. */
export function rangeStartTime(range: ChartRange, firstTradeDate?: string): number | null {
  const date = rangeStartDate(range, firstTradeDate);
  return date ? fromISODate(date).getTime() : null;
}
