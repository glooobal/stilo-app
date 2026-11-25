import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, type ColorValue } from 'react-native';

const SYMBOLS = {
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  trash: { ios: 'trash.fill', android: 'delete' },
} as const;

export const SWIPE_ACTION_WIDTH = 72;

/** Full-height colored button revealed by swiping a list row. */
export function SwipeAction({
  label,
  symbol,
  color,
  onPress,
}: {
  label: string;
  symbol: keyof typeof SYMBOLS;
  color: ColorValue;
  onPress: () => void;
}) {
  const icon = SYMBOLS[symbol];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.action, { backgroundColor: color }]}>
      <SymbolView
        name={{ ios: icon.ios, android: icon.android, web: icon.android }}
        tintColor="#FFFFFF"
        size={22}
        weight="semibold"
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
