import { ActionSheetIOS, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/colors';
import { BENCHMARK_IDS, BENCHMARKS } from '@/lib/benchmarks';

import { toggleBenchmark, type BenchmarkMenuProps } from './benchmark-menu.types';

/** Button with a simple list for platforms without the native menu. */
export function BenchmarkMenu({
  selected,
  onChange,
  withDividends,
  onWithDividendsChange,
}: BenchmarkMenuProps) {
  const open = () => {
    const options = [
      ...BENCHMARKS.map(
        (benchmark) => `${selected.includes(benchmark.id) ? '✓ ' : ''}${benchmark.name}`
      ),
      `${withDividends ? '✓ ' : ''}Wliczaj dywidendy do wyników`,
    ];
    const pick = (index: number) => {
      if (index === BENCHMARKS.length) {
        onWithDividendsChange(!withDividends);
        return;
      }
      const benchmark = BENCHMARKS[index];
      if (!benchmark) return;
      onChange(
        toggleBenchmark(BENCHMARK_IDS, selected, benchmark.id, !selected.includes(benchmark.id))
      );
    };
    if (ActionSheetIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, 'Anuluj'], cancelButtonIndex: options.length },
        pick
      );
      return;
    }
    Alert.alert('Porównaj z', undefined, [
      ...options.map((text, index) => ({ text, onPress: () => pick(index) })),
      { text: 'Anuluj', style: 'cancel' as const },
    ]);
  };
  return (
    <Pressable accessibilityRole="button" onPress={open} style={styles.button}>
      <Text style={styles.label}>Indeksy</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.fill,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.tint,
  },
});
