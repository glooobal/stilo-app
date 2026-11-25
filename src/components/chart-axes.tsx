import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import {
  axisLabelIndices,
  createScale,
  formatAxisDate,
  formatAxisValue,
  GRID_LINES,
  PLOT_MAX,
} from '@/lib/chart-axes';

import type { ValueChartProps } from './value-chart.types';

const Y_AXIS_WIDTH = 56;
const X_AXIS_HEIGHT = 18;
const DASH_COUNT = 48;

type ChartAxesProps = ValueChartProps & {
  /** Drawn under the grid lines, e.g. the fill below the line. */
  background?: ReactNode;
  /** The plot itself; drawn over the grid, in the 0–100 space. */
  children: ReactNode;
};

/** Grid lines, dashed baseline, value labels on the right and dates below. */
export function ChartAxes({
  points,
  baseline,
  range,
  height = 180,
  background,
  children,
}: ChartAxesProps) {
  const [plotWidth, setPlotWidth] = useState(0);
  const values = points.map((point) => point.value);
  if (baseline != null && points.length > 1) values.push(baseline);
  const scale = createScale(values.length ? values : [0]);
  const isFlat = scale.min === scale.max;

  const topFor = (plotY: number) => height * (1 - plotY / PLOT_MAX);
  const gridLines = isFlat ? [scale.toPlotY(scale.min)] : GRID_LINES;
  const spanDays =
    points.length > 1 ? (points[points.length - 1].time - points[0].time) / 86_400_000 : 0;
  const labelIndices = axisLabelIndices(points.length);
  const baselineY =
    baseline != null && points.length > 1 && !isFlat ? scale.toPlotY(baseline) : null;

  return (
    <View>
      <View style={styles.row}>
        <View
          style={[styles.plot, { height }]}
          onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}>
          {background}
          {gridLines.map((plotY) => (
            <View key={plotY} style={[styles.gridLine, { top: topFor(plotY) }]} />
          ))}
          {children}
          {baselineY != null ? (
            <View pointerEvents="none" style={[styles.baseline, { top: topFor(baselineY) }]}>
              {Array.from({ length: DASH_COUNT }, (_, index) => (
                <View key={index} style={styles.dash} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={[styles.yAxis, { height }]}>
          {gridLines.map((plotY) => (
            <Text key={plotY} style={[styles.yLabel, { top: topFor(plotY) - 8 }]} numberOfLines={1}>
              {formatAxisValue(scale.toValue(plotY))}
            </Text>
          ))}
        </View>
      </View>
      <View style={[styles.xAxis, { marginRight: Y_AXIS_WIDTH }]}>
        {plotWidth > 0
          ? labelIndices.map((pointIndex, labelIndex) => {
              const fraction = pointIndex / (points.length - 1);
              const isFirst = labelIndex === 0;
              const isLast = labelIndex === labelIndices.length - 1;
              return (
                <Text
                  key={pointIndex}
                  numberOfLines={1}
                  style={[
                    styles.xLabel,
                    isFirst
                      ? { left: 0, textAlign: 'left' }
                      : isLast
                        ? { right: 0, textAlign: 'right' }
                        : { left: fraction * plotWidth - 40, textAlign: 'center' },
                  ]}>
                  {formatAxisDate(points[pointIndex].time, range, spanDays)}
                </Text>
              );
            })
          : null}
      </View>
    </View>
  );
}

/** Space taken by the date labels below the plot. */
export const X_AXIS_TOTAL_HEIGHT = X_AXIS_HEIGHT + 6;

export { Y_AXIS_WIDTH };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  plot: {
    flex: 1,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dash: {
    width: 3,
    height: 1,
    backgroundColor: Colors.tertiaryLabel,
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
  },
  yLabel: {
    position: 'absolute',
    left: 8,
    right: 0,
    fontSize: 11,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
  xAxis: {
    height: X_AXIS_HEIGHT,
    marginTop: 6,
  },
  xLabel: {
    position: 'absolute',
    width: 80,
    fontSize: 11,
    color: Colors.secondaryLabel,
  },
});
