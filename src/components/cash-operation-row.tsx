import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { CASH_OPERATION_LABELS, signedCashAmount, type CashOperation } from '@/lib/cash';
import { formatDisplayDate } from '@/lib/date';
import { formatMoney, formatSignedMoney } from '@/lib/number';

const ICONS: Record<CashOperation['type'], SFSymbol> = {
  deposit: 'arrow.down.circle.fill',
  withdrawal: 'arrow.up.circle.fill',
  interest: 'percent',
  tax: 'building.columns.fill',
  fee: 'minus.circle.fill',
  income: 'plus.circle.fill',
};

/** A deposit, withdrawal, interest or tax in the operation history. */
export function CashOperationRow({
  operation,
  currency,
  portfolioName,
  onPress,
}: {
  operation: CashOperation;
  currency: string;
  portfolioName?: string;
  onPress: () => void;
}) {
  const label = CASH_OPERATION_LABELS[operation.type];
  const signed = signedCashAmount(operation);
  const date = [formatDisplayDate(operation.date), portfolioName].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${formatMoney(operation.amount, currency)}, ${date}`}
      accessibilityHint="Edytuj operację"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <SymbolView name={ICONS[operation.type]} tintColor={Colors.secondaryLabel} size={26} />
      </View>
      <View style={styles.main}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={styles.title}>
            {label}
          </Text>
          <Text style={[styles.amount, signed > 0 && { color: Colors.positive }]}>
            {formatSignedMoney(signed, currency)}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.detail}>
          {operation.note ? `${date} · ${operation.note}` : date}
        </Text>
      </View>
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
    width: 36,
    alignItems: 'center',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    color: Colors.label,
  },
  amount: {
    fontSize: 17,
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
});
