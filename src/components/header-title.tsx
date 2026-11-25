import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

/** Navigation bar title with a small subtitle below, centered like system titles. */
export function HeaderTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <View style={styles.container} accessibilityRole="header">
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.label,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
});
