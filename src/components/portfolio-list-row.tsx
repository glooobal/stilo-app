import { SymbolView } from 'expo-symbols';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Colors } from '@/constants/colors';
import { ACCOUNT_TYPE_LABELS, type Portfolio } from '@/db/portfolios';
import type { TransactionSide } from '@/db/transactions';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { usePortfolioValuation } from '@/hooks/use-portfolio-valuation';
import { openNewTransaction, openPortfolio } from '@/lib/navigation';
import { formatMoney, formatPercent } from '@/lib/number';
import { confirmDeletePortfolio } from '@/lib/portfolio-actions';

import { SwipeAction } from './swipe-action';

/** Fixed row height, needed to reorder the list by dragging. */
export const PORTFOLIO_ROW_HEIGHT = 64;

/** Polish plural of "pozycja" for a count. */
function positionsLabel(count: number) {
  if (count === 1) return '1 pozycja';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const isFew = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${count} ${isFew ? 'pozycje' : 'pozycji'}`;
}

/**
 * Portfolio in the list: name, positions, current value and total result.
 * Swipe right to delete, swipe left to buy or sell in this portfolio.
 */
export function PortfolioListRow({
  portfolio,
  onOpen,
}: {
  portfolio: Portfolio;
  /** Called when the swipe actions open, so the list can close the previously open row. */
  onOpen?: (methods: SwipeableMethods) => void;
}) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { positions, openPositions } = usePortfolioData(portfolio.id);
  // Only the current value is needed here; one-day data is the cheapest.
  const { series, isLoading } = usePortfolioValuation(positions, '1D', portfolio.baseCurrency, {
    withHistory: false,
  });
  const value = series?.currentValue ?? 0;
  const ratio = series?.profitRatio ?? null;
  const details = [
    portfolio.accountType !== 'standard' ? ACCOUNT_TYPE_LABELS[portfolio.accountType] : null,
    positionsLabel(openPositions.length),
    portfolio.baseCurrency,
  ]
    .filter(Boolean)
    .join(' · ');

  const addTransaction = (side: TransactionSide) => {
    swipeableRef.current?.close();
    openNewTransaction(side, undefined, portfolio.id);
  };

  const row = (
    <Pressable
      accessibilityRole="button"
      onPress={() => openPortfolio(portfolio.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: portfolio.color }]}>
        <SymbolView name={portfolio.icon} tintColor="#FFFFFF" size={20} />
      </View>
      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.name}>
          {portfolio.name}
        </Text>
        <Text numberOfLines={1} style={styles.detail}>
          {details}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.value}>
          {isLoading && !series && positions.length > 0
            ? '…'
            : formatMoney(value, portfolio.baseCurrency)}
        </Text>
        {ratio != null ? (
          <Text
            style={[
              styles.ratio,
              { color: ratio > 0 ? Colors.positive : ratio < 0 ? Colors.negative : Colors.secondaryLabel },
            ]}>
            {formatPercent(ratio)}
          </Text>
        ) : null}
      </View>
      <SymbolView name="chevron.right" tintColor={Colors.tertiaryLabel} size={13} weight="semibold" />
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      childrenContainerStyle={styles.container}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) onOpen?.(swipeableRef.current);
      }}
      renderLeftActions={() => (
        <SwipeAction
          label="Usuń"
          symbol="trash"
          color={Colors.negative}
          onPress={() => {
            swipeableRef.current?.close();
            confirmDeletePortfolio(portfolio);
          }}
        />
      )}
      renderRightActions={() => (
        <>
          <SwipeAction
            label="Kup"
            symbol="plus"
            color={Colors.positive}
            onPress={() => addTransaction('buy')}
          />
          <SwipeAction
            label="Sprzedaj"
            symbol="minus"
            color={Colors.negative}
            onPress={() => addTransaction('sell')}
          />
        </>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
  },
  row: {
    height: PORTFOLIO_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  pressed: {
    backgroundColor: Colors.fill,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderCurve: 'continuous',
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
  ratio: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
