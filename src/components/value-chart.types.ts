import type { ChartRange } from '@/market/types';

export type ValueChartPoint = { time: number; value: number };

export type ValueChartProps = {
  points: ValueChartPoint[];
  /** Dashed reference line, e.g. the value at the start of the range. */
  baseline?: number | null;
  /**
   * Optional dashed second line, one value per point (e.g. invested capital),
   * with its spoken name for VoiceOver.
   */
  secondaryValues?: number[];
  secondaryLabel?: string;
  /** More solid lines in their own colors (e.g. benchmarks), one value per point. */
  extraSeries?: { values: number[]; color: string }[];
  /** Dots on the line at these points (e.g. trades), with their `#RRGGBB` colors. */
  markers?: { index: number; color: string }[];
  /** `percent`: values are ratios (0.12 = 12%) and the axis shows percent. */
  valueFormat?: 'money' | 'percent';
  /** Fading gradient under the main line (default on). */
  showsArea?: boolean;
  /** Decides how dates on the X axis are formatted. */
  range: ChartRange;
  /** Line color as a hex string (blue by default). */
  color?: string;
  height?: number;
  /** Small chart without axes or press-and-hold preview (e.g. in a list row). */
  compact?: boolean;
  /** Index of the point under the finger while scrubbing, `null` when released. */
  onScrub?: (index: number | null) => void;
  /** Spoken name of the chart for VoiceOver, e.g. "Wartość portfela". */
  accessibilityLabel?: string;
  /** Formats a value for VoiceOver, e.g. as money. */
  formatValue?: (value: number) => string;
};
