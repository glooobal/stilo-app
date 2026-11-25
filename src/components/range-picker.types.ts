import type { ChartRange } from '@/market/types';

export { CHART_RANGES } from '@/lib/ranges';

/** Segment label; YTD shows the current year, e.g. "2026". */
export function rangeLabel(range: ChartRange): string {
  switch (range) {
    case '1D':
      return '1 dzień';
    case '1M':
      return 'Miesiąc';
    case '1Y':
      return 'Rok';
    case 'YTD':
      return String(new Date().getFullYear());
    case 'ALL':
      return 'Max';
  }
}

export type RangePickerProps = {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
};
