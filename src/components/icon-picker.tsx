import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/colors';

type IconPickerProps<T extends SFSymbol> = {
  icons: readonly T[];
  value: T;
  /** Background of the selected icon (the portfolio color). */
  color: string;
  onChange: (icon: T) => void;
};

/** Grid of SF Symbols; the selected one is shown on the chosen color. */
export function IconPicker<T extends SFSymbol>({ icons, value, color, onChange }: IconPickerProps<T>) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Ikona portfela">
      {icons.map((icon) => {
        const isSelected = icon === value;
        return (
          <Pressable
            key={icon}
            accessibilityRole="radio"
            accessibilityLabel={icon}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(icon)}
            style={[styles.cell, { backgroundColor: isSelected ? color : Colors.fill }]}>
            <SymbolView
              name={icon}
              tintColor={isSelected ? '#FFFFFF' : Colors.label}
              size={20}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const CELL = 44;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
