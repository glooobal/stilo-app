import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import type { TransactionWithInstrument } from '@/db/transactions';
import { formatDisplayDate } from '@/lib/date';
import {
  formatDecimalInput,
  formatMoney,
  formatPercent,
  formatPrice,
  formatSignedMoney,
} from '@/lib/number';
import type { SaleResult } from '@/lib/positions';
import { formatSplitRatio, isUnsplit } from '@/lib/splits';

import { InstrumentLogo } from './instrument-logo';

type TransactionRowProps = {
  transaction: TransactionWithInstrument;
  /** Realized result when the transaction is a sale. */
  saleResult?: SaleResult;
  /** Hide the instrument name, e.g. on the position screen. */
  showInstrument?: boolean;
  /** Shown next to the date when transactions of several portfolios are listed. */
  portfolioName?: string;
  onPress: () => void;
};

/**
 * Operation row: a green "+" (buy) or red "−" (sell) next to the logo, the
 * date on the left and "5 szt. po 634,15 USD" on the right. Sales also show
 * their realized profit (green) or loss (red).
 */
export function TransactionRow({
  transaction,
  saleResult,
  showInstrument = true,
  portfolioName,
  onPress,
}: TransactionRowProps) {
  const { instrument, side, fee, currency } = transaction;
  const isBuy = side === 'buy';
  // From the values as entered (a split does not change the amount).
  const gross = transaction.enteredQuantity * transaction.enteredPrice;
  const total = isBuy ? gross + fee : gross - fee;
  const sideLabel = isBuy ? 'Kupno' : 'Sprzedaż';
  // A foreign-currency sale shows its result in the portfolio currency, with
  // the exchange rates of the trades.
  const result = saleResult?.base ?? (saleResult ? { ...saleResult, currency } : null);
  const isLoss = result != null && result.amount < 0;
  const date = portfolioName
    ? `${formatDisplayDate(transaction.tradedAt)} · ${portfolioName}`
    : formatDisplayDate(transaction.tradedAt);
  // As entered; after a split, also how many shares that is today.
  const entered = `${formatDecimalInput(transaction.enteredQuantity)} szt. po ${formatPrice(transaction.enteredPrice, currency)}`;
  const quantityAndPrice = isUnsplit(transaction.splitRatio)
    ? entered
    : `${entered} · split ${formatSplitRatio(transaction.splitRatio)}`;

  const accessibilityLabel = [
    showInstrument ? instrument.name : null,
    sideLabel,
    quantityAndPrice,
    date,
    `razem ${formatMoney(total, currency)}`,
    result
      ? `${isLoss ? 'strata' : 'zysk'} ${formatMoney(Math.abs(result.amount), result.currency)}`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  const sideIcon = (size: number) => (
    <SymbolView
      name={isBuy ? 'plus.circle.fill' : 'minus.circle.fill'}
      tintColor={isBuy ? Colors.positive : Colors.negative}
      size={size}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Edytuj transakcję"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {showInstrument ? (
        <View>
          <InstrumentLogo symbol={instrument.symbol} name={instrument.name} size={36} />
          <View style={styles.badge}>{sideIcon(16)}</View>
        </View>
      ) : (
        sideIcon(28)
      )}
      <View style={styles.main}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={styles.title}>
            {showInstrument ? instrument.name : sideLabel}
          </Text>
          <Text style={styles.amount}>{formatMoney(total, currency)}</Text>
        </View>
        <View style={styles.line}>
          <Text numberOfLines={1} style={[styles.detail, styles.shrink, styles.left]}>
            {date}
          </Text>
          <Text numberOfLines={1} style={[styles.detail, styles.shrink]}>
            {quantityAndPrice}
          </Text>
        </View>
        {result ? (
          <Text style={[styles.result, { color: isLoss ? Colors.negative : Colors.positive }]}>
            {isLoss ? 'Strata' : 'Zysk'} {formatSignedMoney(result.amount, result.currency)} (
            {formatPercent(result.ratio)})
          </Text>
        ) : null}
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
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    borderRadius: 9,
    backgroundColor: Colors.card,
    padding: 1,
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
    fontVariant: ['tabular-nums'],
  },
  shrink: {
    flexShrink: 1,
    textAlign: 'right',
  },
  left: {
    textAlign: 'left',
  },
  result: {
    alignSelf: 'flex-end',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
