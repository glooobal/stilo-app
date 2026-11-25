import type { ChartRange } from '@/market/types';

/**
 * The line is drawn in a fixed 0–100 coordinate space on both axes, so the
 * axis labels (drawn separately) can be placed at exact positions. Data uses
 * the band between the paddings, leaving air above and below the line.
 */
export const PLOT_MIN = 0;
export const PLOT_MAX = 100;
const BAND_LOW = 10;
const BAND_HIGH = 90;

export type ChartScale = {
  min: number;
  max: number;
  /** Maps a value to the 0–100 plot space. */
  toPlotY: (value: number) => number;
  /** Maps the 0–100 plot space back to a value. */
  toValue: (plotY: number) => number;
};

export function createScale(values: number[]): ChartScale {
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = max - min;

  if (span === 0) {
    // Flat line: at the bottom for zero (empty portfolio), else in the middle.
    const flatY = min === 0 ? BAND_LOW : (BAND_LOW + BAND_HIGH) / 2;
    return {
      min,
      max,
      toPlotY: () => flatY,
      toValue: () => min,
    };
  }
  const band = BAND_HIGH - BAND_LOW;
  return {
    min,
    max,
    toPlotY: (value) => BAND_LOW + ((value - min) / span) * band,
    toValue: (plotY) => min + ((plotY - BAND_LOW) / band) * span,
  };
}

/** Plot Y positions of the horizontal grid lines with value labels. */
export const GRID_LINES = [BAND_HIGH, (BAND_LOW + BAND_HIGH) / 2, BAND_LOW];

/** Short axis value, e.g. `12,4 tys.` or `1,2 mln`. */
export function formatAxisValue(value: number): string {
  const abs = Math.abs(value);
  const format = (number: number, digits: number) =>
    number
      .toFixed(digits)
      .replace('.', ',')
      .replace(/(,\d*?)0+$/, '$1')
      .replace(/,$/, '');
  if (abs >= 1_000_000) return `${format(value / 1_000_000, 2)} mln`;
  if (abs >= 10_000) return `${format(value / 1_000, 1)} tys.`;
  if (abs >= 100) return format(value, 0);
  return format(value, 2);
}

/** Date label for the X axis, depending on the range length. */
export function formatAxisDate(time: number, range: ChartRange, spanDays: number): string {
  const date = new Date(time);
  const month = date.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '');
  const year = String(date.getFullYear()).slice(2);

  if (range === '1D') {
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }
  if (spanDays <= 62) return `${date.getDate()} ${month}`;
  if (spanDays <= 400) return range === 'YTD' ? month : `${month} ${year}`;
  if (spanDays <= 3 * 365) return `${month} ${year}`;
  return String(date.getFullYear());
}

/** Indices of the points labelled on the X axis (evenly spread). */
export function axisLabelIndices(count: number, labels = 4): number[] {
  if (count < 2) return [];
  const n = Math.min(labels, count);
  return Array.from({ length: n }, (_, index) => Math.round((index * (count - 1)) / (n - 1)));
}
