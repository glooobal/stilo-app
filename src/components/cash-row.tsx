import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { formatMoney } from '@/lib/number';

/**
 * Cash of the cash portfolios, as the first row of the positions. A
 * negative balance (purchases without deposits) is flagged.
 */
export function CashRow({
  amount,
  currency,
  onPress,
}: {
  amount: number;
  currency: string;
  onPress: () => void;
}) {
  const isNegative = amount < 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Gotówka ${formatMoney(amount, currency)}${isNegative ? ', ujemne saldo, dodaj wpłatę' : ''}`}
      accessibilityHint="Pokazuje wpłaty i wypłaty"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <SymbolView name="banknote" tintColor="#FFFFFF" size={20} />
      </View>
      <View style={styles.main}>
        <Text style={styles.name}>Gotówka</Text>
        {isNegative ? (
          <View style={styles.warning}>
            <SymbolView name="exclamationmark.triangle.fill" tintColor={Colors.warning} size={11} />
            <Text style={[styles.detail, styles.warningText]}>Ujemne saldo · dodaj wpłatę</Text>
          </View>
        ) : (
          <Text style={styles.detail}>Wolne środki</Text>
        )}
      </View>
      <Text style={[styles.value, isNegative && { color: Colors.negative }]}>
        {formatMoney(amount, currency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressed: {
    backgroundColor: Colors.fill,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
    color: Colors.label,
  },
  detail: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  warningText: {
    color: Colors.warning,
  },
  value: {
    fontSize: 17,
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
});
