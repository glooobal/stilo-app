import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, type LayoutRectangle } from 'react-native';

import { Colors } from '@/constants/colors';
import type { ChartRange } from '@/market/types';

import {
  CHART_RANGES,
  rangeAccessibilityLabel,
  rangeLabel,
  type RangePickerProps,
} from './range-picker.types';

/** Buttons visible at once: the half one at the edge shows the row scrolls. */
const VISIBLE_CHIPS = 6.5;
const GAP = 4;
/** The row reaches the card edges (it sits inside the card's 16 pt padding). */
const BLEED = 16;

/**
 * Range buttons in a row that scrolls sideways, like the range selector of
 * the iOS Stocks app: the selected one is a filled capsule, the others plain
 * text. The row runs to the card edges and the last visible button is cut
 * in half, so it is clear there is more.
 */
export function RangeChips({ value, onChange }: RangePickerProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const layouts = useRef(new Map<ChartRange, LayoutRectangle>());
  const viewWidth = useRef(0);
  const [chipWidth, setChipWidth] = useState<number | null>(null);

  const scrollToSelected = (animated: boolean) => {
    const layout = layouts.current.get(value);
    if (!layout || !viewWidth.current) return;
    const x = Math.max(0, layout.x + layout.width / 2 - viewWidth.current / 2);
    scrollRef.current?.scrollTo({ x, animated });
  };

  useEffect(() => {
    scrollToSelected(true);
    // Only when the selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={styles.scroll}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        viewWidth.current = width;
        const fitted = (width - BLEED - GAP * Math.floor(VISIBLE_CHIPS)) / VISIBLE_CHIPS;
        setChipWidth(Math.max(44, Math.floor(fitted)));
      }}
      contentContainerStyle={styles.content}>
      {CHART_RANGES.map((range) => {
        const isSelected = range === value;
        return (
          <Pressable
            key={range}
            accessibilityRole="tab"
            accessibilityLabel={rangeAccessibilityLabel(range)}
            accessibilityState={{ selected: isSelected }}
            hitSlop={{ top: 6, bottom: 6 }}
            onLayout={(event) => {
              layouts.current.set(range, event.nativeEvent.layout);
              if (isSelected) scrollToSelected(false);
            }}
            onPress={() => onChange(range)}
            style={({ pressed }) => [
              styles.chip,
              chipWidth != null && { width: chipWidth },
              isSelected && styles.selected,
              pressed && !isSelected && styles.pressed,
            ]}>
            <Text style={[styles.label, isSelected && styles.selectedLabel]}>
              {rangeLabel(range)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginHorizontal: -BLEED,
  },
  content: {
    gap: GAP,
    paddingHorizontal: BLEED,
  },
  chip: {
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  selected: {
    backgroundColor: Colors.fill,
  },
  pressed: {
    opacity: 0.5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: Colors.secondaryLabel,
  },
  selectedLabel: {
    color: Colors.label,
  },
});
