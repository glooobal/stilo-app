import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

import { ChartAxes } from './chart-axes';
import type { ValueChartProps } from './value-chart.types';

/** Axes without the line until a chart for platforms other than iOS is added. */
export function ValueChart(props: ValueChartProps) {
  // A small chart in a list has no room for the note.
  if (props.compact) return <View style={{ height: props.height ?? 56 }} />;
  return (
    <ChartAxes {...props}>
      <View style={styles.placeholder}>
        <Text style={styles.text}>Wykres jest na razie dostępny na iOS.</Text>
      </View>
    </ChartAxes>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
});
