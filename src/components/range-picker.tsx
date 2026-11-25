import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

import { CHART_RANGES, rangeLabel, type RangePickerProps } from './range-picker.types';

/** Segmented control for platforms without the SwiftUI one. */
export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {CHART_RANGES.map((range) => {
        const isSelected = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(range)}
            style={[styles.segment, isSelected && styles.selected]}>
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>
              {rangeLabel(range)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: 9,
    backgroundColor: Colors.fill,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 7,
  },
  selected: {
    backgroundColor: Colors.card,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.label,
  },
  selectedLabel: {
    fontWeight: '600',
  },
});
