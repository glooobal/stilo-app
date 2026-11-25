import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/colors';

type CardProps = {
  title?: string;
  /** Optional element on the right of the title, e.g. a "Show all" link. */
  accessory?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Rounded grouped panel (inset grouped style) used on overview screens. */
export function Card({ title, accessory, children, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {accessory}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: Colors.card,
    overflow: 'hidden',
  },
  // Same as the "Pozycje" section header in the portfolio panel.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 4,
    minHeight: 44,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.label,
  },
});
