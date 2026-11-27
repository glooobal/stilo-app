import type { ChartRange } from '@/market/types';

export { CHART_RANGES } from '@/lib/ranges';

/** Button label: the usual short codes, "MAX" for the whole history. */
export function rangeLabel(range: ChartRange): string {
  return range === 'ALL' ? 'MAX' : range;
}

/** Spoken label of a range button. */
export function rangeAccessibilityLabel(range: ChartRange): string {
  switch (range) {
    case '1D':
      return 'Dzisiaj';
    case '1W':
      return 'Tydzień';
    case '1M':
      return 'Miesiąc';
    case '3M':
      return '3 miesiące';
    case '6M':
      return '6 miesięcy';
    case 'YTD':
      return 'Od początku roku';
    case '1Y':
      return 'Rok';
    case '5Y':
      return '5 lat';
    case 'ALL':
      return 'Od początku';
  }
}

export type RangePickerProps = {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
};
