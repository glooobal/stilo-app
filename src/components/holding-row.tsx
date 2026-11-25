import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import {
  AVERAGE_PRICE_DIGITS,
  formatDecimalInput,
  formatMoney,
  formatPercent,
  formatPrice,
} from '@/lib/number';
import { formatDisplayDate, toISODate } from '@/lib/date';
import type { Position } from '@/lib/positions';
import type { PositionValuation } from '@/lib/valuation';

import { InstrumentLogo } from './instrument-logo';
import { Skeleton } from './skeleton';

type HoldingRowProps = {
  position: Position;
  /** Portfolio currency; the value is shown in it so rows compare directly. */
  baseCurrency: string;
  valuation?: PositionValuation;
  /** Share of the portfolio (0–1); shown instead of the average price when given. */
  share?: number;
  /** Prices are loading for the first time: placeholders instead of "—". */
  isLoading?: boolean;
  onPress: () => void;
};

/** Short note when the price is not current, e.g. "cena z 21.11.2026". */
function stalePriceNote(valuation: PositionValuation | undefined): string | null {
  if (!valuation || valuation.priceSource === 'live' || valuation.priceSource == null) return null;
  const date =
    valuation.priceTime != null ? formatDisplayDate(toISODate(new Date(valuation.priceTime))) : null;
  if (valuation.priceSource === 'trade') {
    return date ? `brak notowań · cena z transakcji ${date}` : 'brak notowań';
  }
  return date ? `cena z ${date}` : 'ostatnia zapisana cena';
}

export function HoldingRow({
  position,
  baseCurrency,
  valuation,
  share,
  isLoading = false,
  onPress,
}: HoldingRowProps) {
  const { instrument } = position;
  // Current result of the position (unrealized, since purchase).
  // In the base currency, so a change of the exchange rate counts too.
  const ratio = valuation?.baseProfitRatio ?? valuation?.profitRatio ?? null;
  const staleNote = stalePriceNote(valuation);
  const isPlaceholder = isLoading && !valuation;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={staleNote ? `Uwaga: ${staleNote}` : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <InstrumentLogo symbol={instrument.symbol} name={instrument.name} size={40} />
      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.name}>
          {instrument.name}
        </Text>
        {staleNote ? (
          <View style={styles.staleLine}>
            <SymbolView name="exclamationmark.triangle.fill" tintColor={Colors.warning} size={11} />
            <Text numberOfLines={1} style={[styles.detail, styles.stale]}>
              {staleNote}
            </Text>
          </View>
        ) : (
          <Text numberOfLines={1} style={styles.detail}>
            {formatDecimalInput(position.quantity)} szt. ·{' '}
            {share != null
              ? `${formatPercent(share, false)} portfela`
              : `śr. ${formatPrice(position.averagePrice, instrument.currency, AVERAGE_PRICE_DIGITS)}`}
          </Text>
        )}
      </View>
      <View style={styles.trailing}>
        {isPlaceholder ? (
          <>
            <Skeleton width={84} height={17} />
            <Skeleton width={52} height={13} />
          </>
        ) : (
          <Text style={styles.value}>
            {valuation?.baseValue != null ? formatMoney(valuation.baseValue, baseCurrency) : '—'}
          </Text>
        )}
        {!isPlaceholder && ratio != null ? (
          <Text style={[styles.change, { color: ratio < 0 ? Colors.negative : Colors.positive }]}>
            {formatPercent(ratio)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  staleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stale: {
    flexShrink: 1,
    color: Colors.warning,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: {
    backgroundColor: Colors.fill,
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
    fontVariant: ['tabular-nums'],
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 2,
  },
  value: {
    fontSize: 17,
    fontWeight: '500',
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  change: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
