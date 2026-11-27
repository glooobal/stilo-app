import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { formatDisplayDate } from '@/lib/date';
import { formatMoney } from '@/lib/number';
import type { ReceivedDividend } from '@/hooks/use-dividends-overview';

import { InstrumentLogo } from './instrument-logo';

/**
 * A dividend received: logo and name, the date (and portfolio), the net
 * amount in the summary currency and gross / tax below it.
 */
export function DividendRow({
  dividend,
  baseCurrency,
  portfolioName,
  detailText,
  onPress,
}: {
  dividend: ReceivedDividend;
  baseCurrency: string;
  portfolioName?: string;
  /** Replaces the gross / tax line on the right, e.g. "Wypłata dywidendy" in the history. */
  detailText?: string;
  onPress: () => void;
}) {
  const { instrument, amounts } = dividend;
  const date = [formatDisplayDate(dividend.paidAt), portfolioName]
    .filter(Boolean)
    .join(' · ');
  const net = amounts ? formatMoney(amounts.net, baseCurrency) : '—';
  const detail = detailText
    ? detailText
    : amounts
      ? `brutto ${formatMoney(amounts.gross, baseCurrency)} · podatek ${formatMoney(amounts.tax, baseCurrency)}`
      : `brutto ${formatMoney(dividend.gross, dividend.currency)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${instrument.name}, dywidenda ${net} netto, ${date}, ${detail}`}
      accessibilityHint="Edytuj dywidendę"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <InstrumentLogo symbol={instrument.symbol} name={instrument.name} size={36} />
      <View style={styles.main}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={styles.title}>
            {instrument.name}
          </Text>
          <Text style={styles.amount}>{net}</Text>
        </View>
        {/* Under each other: side by side the amounts did not fit. */}
        <Text numberOfLines={1} style={styles.detail}>
          {date}
        </Text>
        <Text numberOfLines={1} style={styles.detail}>
          {detail}
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
    color: Colors.positive,
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
});
