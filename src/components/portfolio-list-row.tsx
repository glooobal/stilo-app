import { SymbolView } from 'expo-symbols';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ChartColors, Colors } from '@/constants/colors';
import { ACCOUNT_TYPE_LABELS, type Portfolio } from '@/db/portfolios';
import type { TransactionSide } from '@/db/transactions';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { usePortfolioValuation } from '@/hooks/use-portfolio-valuation';
import { openNewTransaction, openPortfolio } from '@/lib/navigation';
import { formatMoney, formatPercent, formatSignedMoney } from '@/lib/number';
import { confirmDeletePortfolio } from '@/lib/portfolio-actions';

import { Skeleton } from './skeleton';
import { SwipeAction } from './swipe-action';
import { ValueChart } from './value-chart';

const PANEL_HEIGHT = 136;
const PANEL_GAP = 16;
/** Height of one item in the list (panel + space below), needed to reorder by dragging. */
export const PORTFOLIO_ROW_HEIGHT = PANEL_HEIGHT + PANEL_GAP;
const SPARKLINE_WIDTH = 116;
const SPARKLINE_HEIGHT = 56;

/** Polish plural of "pozycja" for a count. */
function positionsLabel(count: number) {
  if (count === 1) return '1 pozycja';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const isFew = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${count} ${isFew ? 'pozycje' : 'pozycji'}`;
}

/**
 * Portfolio panel in the list: name and details, value and total result,
 * and a small chart of the result since the start (green for a profit,
 * red for a loss). Swipe right to delete, swipe left to buy or sell.
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
  const { positions, openPositions, dividends, cash } = usePortfolioData(portfolio.id);
  const { series, isLoading } = usePortfolioValuation(positions, 'ALL', portfolio.baseCurrency, {
    dividends,
    cash,
  });
  const value = series?.currentValue ?? 0;
  const profit = series?.currentProfit ?? null;
  const ratio = series?.profitRatio ?? null;
  const isLoss = (profit ?? 0) < 0;
  const resultColor =
    profit == null || profit === 0 ? Colors.secondaryLabel : isLoss ? Colors.negative : Colors.positive;
  const profitPoints = (series?.points ?? []).map((point) => ({
    time: point.time,
    value: point.profit,
  }));
  const isFirstLoad = isLoading && !series && positions.length > 0;
  const details = [
    portfolio.accountType !== 'standard' ? ACCOUNT_TYPE_LABELS[portfolio.accountType] : null,
    portfolio.isCash ? 'gotówkowy' : null,
    positionsLabel(openPositions.length),
    portfolio.baseCurrency,
  ]
    .filter(Boolean)
    .join(' · ');

  const addTransaction = (side: TransactionSide) => {
    swipeableRef.current?.close();
    openNewTransaction(side, undefined, portfolio.id);
  };

  const resultText =
    profit != null
      ? `${formatSignedMoney(profit, portfolio.baseCurrency)}${ratio != null ? ` (${formatPercent(ratio)})` : ''}`
      : ' ';

  const panel = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${portfolio.name}, ${details}, wartość ${formatMoney(value, portfolio.baseCurrency)}${profit != null ? `, wynik ${resultText}` : ''}`}
      onPress={() => openPortfolio(portfolio.id)}
      style={({ pressed }) => [styles.panel, pressed && styles.pressed]}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <SymbolView name={portfolio.icon} tintColor="#FFFFFF" size={18} />
        </View>
        <View style={styles.titles}>
          <Text numberOfLines={1} style={styles.name}>
            {portfolio.name}
          </Text>
          <Text numberOfLines={1} style={styles.detail}>
            {details}
          </Text>
        </View>
        <SymbolView name="chevron.right" tintColor={Colors.tertiaryLabel} size={13} weight="semibold" />
      </View>
      <View style={styles.bottom}>
        <View style={styles.amounts}>
          {isFirstLoad ? (
            <>
              <Skeleton width={130} height={24} />
              <Skeleton width={96} height={14} />
            </>
          ) : (
            <>
              <Text style={styles.value} adjustsFontSizeToFit numberOfLines={1}>
                {formatMoney(value, portfolio.baseCurrency)}
              </Text>
              <Text numberOfLines={1} style={[styles.result, { color: resultColor }]}>
                {resultText}
              </Text>
            </>
          )}
        </View>
        <View style={styles.sparkline} pointerEvents="none">
          {profitPoints.length > 1 ? (
            <ValueChart
              points={profitPoints}
              range="ALL"
              compact
              height={SPARKLINE_HEIGHT}
              color={isLoss ? ChartColors.loss : ChartColors.profit}
              accessibilityLabel={`Wynik portfela ${portfolio.name}`}
            />
          ) : isFirstLoad ? (
            <Skeleton width="100%" height={SPARKLINE_HEIGHT} radius={8} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
        overshootLeft={false}
        overshootRight={false}
        childrenContainerStyle={styles.swipeContent}
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
        {panel}
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: PANEL_HEIGHT,
    marginHorizontal: 16,
    borderRadius: 26,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  swipeContent: {
    backgroundColor: Colors.card,
  },
  panel: {
    height: PANEL_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: Colors.card,
  },
  pressed: {
    backgroundColor: Colors.fill,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 34,
    height: 34,
    backgroundColor: Colors.iconBackground,
    borderRadius: 9,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.label,
  },
  detail: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  amounts: {
    flex: 1,
    gap: 4,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  result: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sparkline: {
    width: SPARKLINE_WIDTH,
    height: SPARKLINE_HEIGHT,
  },
});
