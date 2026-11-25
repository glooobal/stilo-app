import { requireNativeView } from 'expo';
import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ChartColors } from '@/constants/colors';
import { axisLabelIndices, formatAxisDate } from '@/lib/chart-axes';
import { formatPointDate } from '@/lib/date';

import type { ValueChartProps } from './value-chart.types';

type NativeChartProps = {
  values: number[];
  secondaryValues?: number[];
  baseline?: number | null;
  color: string;
  xLabels: { index: number; text: string }[];
  accessibilityTitle: string;
  pointLabels: string[];
  onScrub?: (event: { nativeEvent: { index: number } }) => void;
  style?: StyleProp<ViewStyle>;
};

/** Swift Charts view from the local `modules/portfolio-chart` module. */
const NativePortfolioChart = requireNativeView<NativeChartProps>('PortfolioChart');

const defaultFormatValue = (value: number) => value.toFixed(2).replace('.', ',');

/** Extra height for the date labels below the plot. */
const X_AXIS_HEIGHT = 24;

/**
 * Native Swift Charts line: gradient fill, dates below, values on the right
 * and press-and-hold scrubbing. Switching data crossfades between charts
 * instead of morphing one line into another.
 */
export function ValueChart({
  points,
  baseline,
  secondaryValues,
  secondaryLabel,
  range,
  color = ChartColors.line,
  height = 180,
  onScrub,
  accessibilityLabel = 'Wykres',
  formatValue = defaultFormatValue,
}: ValueChartProps) {
  const values = useMemo(() => points.map((point) => point.value), [points]);
  const xLabels = useMemo(() => {
    const spanDays =
      points.length > 1 ? (points[points.length - 1].time - points[0].time) / 86_400_000 : 0;
    return axisLabelIndices(points.length).map((index) => ({
      index,
      text: formatAxisDate(points[index].time, range, spanDays),
    }));
  }, [points, range]);

  // Read by VoiceOver while moving through the points.
  const pointLabels = useMemo(
    () =>
      points.map((point, index) => {
        const label = `${formatPointDate(point.time, range === '1D')}: ${formatValue(point.value)}`;
        const secondary = secondaryValues?.[index];
        return secondary != null && secondaryLabel
          ? `${label}, ${secondaryLabel}: ${formatValue(secondary)}`
          : label;
      }),
    [points, range, formatValue, secondaryValues, secondaryLabel]
  );

  const dataKey = `${range}:${points.length}:${points[0]?.time}:${points.at(-1)?.time}:${secondaryValues ? 's' : ''}`;
  const totalHeight = height + X_AXIS_HEIGHT;

  return (
    <View style={{ height: totalHeight }}>
      <Animated.View
        key={dataKey}
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(200)}
        style={StyleSheet.absoluteFill}>
        <NativePortfolioChart
          values={values}
          secondaryValues={secondaryValues}
          baseline={baseline}
          color={color}
          xLabels={xLabels}
          accessibilityTitle={accessibilityLabel}
          pointLabels={pointLabels}
          onScrub={(event) => {
            const index = event.nativeEvent.index;
            onScrub?.(index >= 0 ? index : null);
          }}
          style={{ height: totalHeight }}
        />
      </Animated.View>
    </View>
  );
}
