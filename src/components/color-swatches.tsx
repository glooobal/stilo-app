import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Colors } from '@/constants/colors';

type ColorSwatchesProps = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
};

const COLUMNS = 5;
const SWATCH = 30;
const RING = SWATCH + 10;
/** Horizontal space taken by the grouped form around the row (insets + row padding). */
const FORM_CHROME = 80;
const MAX_WIDTH = 360;

/**
 * Grid of round color swatches, five per row spread across the row width;
 * the selected one has a ring around it. The width is computed up front
 * because the native form host sizes itself to its content.
 */
export function ColorSwatches({ colors, value, onChange }: ColorSwatchesProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth - FORM_CHROME, MAX_WIDTH);

  const rows: string[][] = [];
  for (let i = 0; i < colors.length; i += COLUMNS) {
    rows.push(colors.slice(i, i + COLUMNS));
  }

  return (
    <View
      style={[styles.grid, { width }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Kolor portfela">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {Array.from({ length: COLUMNS }, (_, column) => {
            const color = row[column];
            if (!color) return <View key={column} style={styles.ring} />;
            const isSelected = color === value;
            return (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={`Kolor ${rowIndex * COLUMNS + column + 1}`}
                accessibilityState={{ selected: isSelected }}
                hitSlop={4}
                onPress={() => onChange(color)}
                style={[styles.ring, isSelected && { borderColor: color }]}>
                <View style={[styles.swatch, { backgroundColor: color }]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.separator,
  },
});
