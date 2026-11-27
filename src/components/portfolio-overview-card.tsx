import { useMemo, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Colors } from '@/constants/colors';
import { allocationSegments } from '@/lib/allocation';
import { openHistory, openNewTransaction, openPosition } from '@/lib/navigation';
import {
  POSITION_SORT_LABELS,
  POSITION_SORTS,
  portfolioShares,
  sortPositions,
  type PositionSort,
} from '@/lib/position-sort';
import {
  POSITION_RESULT_LABELS,
  POSITION_RESULT_PERIODS,
  type PositionResultPeriod,
} from '@/lib/position-result';
import { readPreference, writePreference } from '@/lib/preferences';
import type { Position } from '@/lib/positions';
import type { PortfolioSeries, PositionValuation } from '@/lib/valuation';
import type { ChartRange } from '@/market/types';

import { AllocationBar } from './allocation-bar';
import { Card } from './card';
import { CashRow } from './cash-row';
import { SwipeableHoldingRow } from './swipeable-holding-row';
import { RangePicker } from './range-picker';
import { Separator } from './separator';
import { IconMenuPicker } from './icon-menu-picker';
import { PortfolioChartPager } from './portfolio-chart-pager';

const SORT_PREFERENCE = 'summary.positionsSort';
const RESULT_PERIOD_PREFERENCE = 'summary.positionsResultPeriod';

type PortfolioOverviewCardProps = {
  /** Set inside a single portfolio; positions and actions then stay in it. */
  portfolioId?: string;
  baseCurrency: string;
  positions: Position[];
  series: PortfolioSeries | null;
  valuations: Map<string, PositionValuation>;
  /** Selected range. */
  range: ChartRange;
  /** Range of the data on screen; lags behind `range` while it loads. */
  displayedRange: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  isLoading: boolean;
};

/** Swipeable value/profit charts for the selected range and the current holdings. */
export function PortfolioOverviewCard({
  portfolioId,
  baseCurrency,
  positions,
  series,
  valuations,
  range,
  displayedRange,
  onRangeChange,
  isLoading,
}: PortfolioOverviewCardProps) {
  // Only one row shows its swipe actions at a time.
  const openRowRef = useRef<SwipeableMethods | null>(null);
  const [sort, setSort] = useState<PositionSort>(() =>
    readPreference(SORT_PREFERENCE, POSITION_SORTS, 'value')
  );
  const changeSort = (next: PositionSort) => {
    setSort(next);
    writePreference(SORT_PREFERENCE, next);
  };
  const [resultPeriod, setResultPeriod] = useState<PositionResultPeriod>(() =>
    readPreference(RESULT_PERIOD_PREFERENCE, POSITION_RESULT_PERIODS, 'total')
  );
  const changeResultPeriod = (next: PositionResultPeriod) => {
    setResultPeriod(next);
    writePreference(RESULT_PERIOD_PREFERENCE, next);
  };
  const sortedPositions = useMemo(
    () => sortPositions(positions, sort, valuations, resultPeriod),
    [positions, sort, valuations, resultPeriod]
  );
  const shares = useMemo(() => portfolioShares(positions, valuations), [positions, valuations]);
  const cashBalance = series?.cash ?? null;
  // Structure of the whole value: the positions and the cash.
  const allocation = useMemo(() => {
    const items = positions.map((position) => ({
      key: position.instrument.symbol,
      label: position.instrument.name,
      value: valuations.get(position.instrument.symbol)?.baseValue ?? 0,
    }));
    if (cashBalance != null && cashBalance > 0) {
      items.push({ key: 'cash', label: 'Gotówka', value: cashBalance });
    }
    const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
    return allocationSegments(
      items.map((item) => ({
        key: item.key,
        label: item.label,
        share: total > 0 ? Math.max(item.value, 0) / total : 0,
      }))
    );
  }, [positions, valuations, cashBalance]);

  return (
    <Card>
      <PortfolioChartPager
        // The summary shows all portfolios together.
        valueTitle={portfolioId ? 'Wartość portfela' : 'Wartość inwestycji'}
        baseCurrency={baseCurrency}
        series={series}
        range={displayedRange}
        isLoading={isLoading && positions.length > 0}
        footer={
          <View style={styles.picker}>
            <RangePicker value={range} onChange={onRangeChange} />
          </View>
        }
      />

      {/* Space instead of a line between the chart and the positions. */}
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Pozycje
        </Text>
        <View style={styles.pickers}>
          {positions.length > 0 ? (
            <IconMenuPicker
              icon="clock"
              title="Wynik pozycji"
              value={resultPeriod}
              options={POSITION_RESULT_PERIODS}
              labels={POSITION_RESULT_LABELS}
              onChange={changeResultPeriod}
            />
          ) : null}
          {positions.length > 1 ? (
            <IconMenuPicker
              icon="arrow.up.arrow.down"
              title="Sortuj według"
              value={sort}
              options={POSITION_SORTS}
              labels={POSITION_SORT_LABELS}
              onChange={changeSort}
            />
          ) : null}
        </View>
      </View>
      <AllocationBar segments={allocation} />
      {cashBalance != null ? (
        <>
          <CashRow
            amount={cashBalance}
            currency={baseCurrency}
            onPress={() => openHistory(portfolioId)}
          />
          {positions.length > 0 ? <Separator inset={68} /> : null}
        </>
      ) : null}
      {positions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.note}>Nie masz w portfelu żadnych pozycji.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => openNewTransaction('buy', undefined, portfolioId)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <SymbolView name="plus" tintColor={Colors.tint} size={15} weight="semibold" />
            <Text style={styles.addLabel}>Dodaj operację</Text>
          </Pressable>
        </View>
      ) : (
        sortedPositions.map((position, index) => (
          <View key={position.instrument.symbol}>
            {index > 0 ? <Separator inset={68} /> : null}
            <SwipeableHoldingRow
              position={position}
              baseCurrency={baseCurrency}
              portfolioId={portfolioId}
              valuation={valuations.get(position.instrument.symbol)}
              share={sort === 'share' ? shares.get(position.instrument.symbol) : undefined}
              isLoading={isLoading}
              resultPeriod={resultPeriod}
              onPress={() => openPosition(position.instrument.symbol, portfolioId)}
              onOpen={(methods) => {
                if (openRowRef.current && openRowRef.current !== methods) {
                  openRowRef.current.close();
                }
                openRowRef.current = methods;
              }}
            />
          </View>
        ))
      )}
      <View style={styles.bottomSpace} />
    </Card>
  );
}

const styles = StyleSheet.create({
  picker: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  note: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
  pickers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 16,
    paddingBottom: 8,
    minHeight: 44,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.label,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.fill,
  },
  pressed: {
    opacity: 0.7,
  },
  addLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.tint,
  },
  bottomSpace: {
    height: 6,
  },
});
