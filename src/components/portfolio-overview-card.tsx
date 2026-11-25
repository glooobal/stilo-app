import { useMemo, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Colors } from '@/constants/colors';
import { allocationSegments } from '@/lib/allocation';
import { openNewTransaction, openPosition } from '@/lib/navigation';
import {
  POSITION_SORTS,
  portfolioShares,
  sortPositions,
  type PositionSort,
} from '@/lib/position-sort';
import { readPreference, writePreference } from '@/lib/preferences';
import type { Position } from '@/lib/positions';
import type { PortfolioSeries, PositionValuation } from '@/lib/valuation';
import type { ChartRange } from '@/market/types';

import { AllocationBar } from './allocation-bar';
import { Card } from './card';
import { SwipeableHoldingRow } from './swipeable-holding-row';
import { RangePicker } from './range-picker';
import { Separator } from './separator';
import { SortPicker } from './sort-picker';
import { PortfolioChartPager } from './portfolio-chart-pager';

const SORT_PREFERENCE = 'summary.positionsSort';

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
  const sortedPositions = useMemo(
    () => sortPositions(positions, sort, valuations),
    [positions, sort, valuations]
  );
  const shares = useMemo(() => portfolioShares(positions, valuations), [positions, valuations]);
  const allocation = useMemo(
    () =>
      allocationSegments(
        positions.map((position) => ({
          key: position.instrument.symbol,
          label: position.instrument.name,
          share: shares.get(position.instrument.symbol) ?? 0,
        }))
      ),
    [positions, shares]
  );

  return (
    <Card>
      <PortfolioChartPager
        // The summary shows all portfolios together.
        valueTitle={portfolioId ? 'Wartość portfela' : 'Twoje inwestycje'}
        baseCurrency={baseCurrency}
        series={series}
        range={displayedRange}
        isLoading={isLoading && positions.length > 0}
      />

      <View style={styles.picker}>
        <RangePicker value={range} onChange={onRangeChange} />
      </View>

      <Separator inset={0} />
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Pozycje
        </Text>
        {positions.length > 1 ? <SortPicker value={sort} onChange={changeSort} /> : null}
      </View>
      <AllocationBar segments={allocation} />
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
    paddingVertical: 12,
  },
  note: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 12,
    paddingBottom: 4,
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
