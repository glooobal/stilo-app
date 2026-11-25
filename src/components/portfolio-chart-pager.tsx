import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ChartColors, Colors } from '@/constants/colors';
import { formatPointDate } from '@/lib/date';
import { formatMoney, formatPercent, formatProfit, formatSignedMoney } from '@/lib/number';
import { RANGE_CHANGE_LABELS } from '@/lib/ranges';
import type { PortfolioSeries } from '@/lib/valuation';
import type { ChartRange } from '@/market/types';

import { Skeleton } from './skeleton';
import { ValueChart } from './value-chart';

type Page = 'value' | 'profit';

/** Green for gains, red for losses, neutral for no change. */
function changeColor(change: number) {
  if (change > 0) return Colors.positive;
  if (change < 0) return Colors.negative;
  return Colors.secondaryLabel;
}
const PAGES: Page[] = ['value', 'profit'];
/** Ranges whose value chart also shows the invested capital. */
const CAPITAL_RANGES: readonly ChartRange[] = ['1Y', 'YTD', 'ALL'];

type PortfolioChartPagerProps = {
  /** Caption of the value page, e.g. "Twoje inwestycje" on the summary. */
  valueTitle: string;
  baseCurrency: string;
  series: PortfolioSeries | null;
  /** Range of the data on screen. */
  range: ChartRange;
  isLoading: boolean;
};

/**
 * Swipeable charts in the portfolio panel: value, then profit. Press and hold
 * a chart to see the date and value under the finger in the header.
 */
export function PortfolioChartPager({
  valueTitle,
  baseCurrency,
  series,
  range,
  isLoading,
}: PortfolioChartPagerProps) {
  const [width, setWidth] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const points = useMemo(() => series?.points ?? [], [series]);
  const valuePoints = useMemo(
    () => points.map((point) => ({ time: point.time, value: point.value })),
    [points]
  );
  const profitPoints = useMemo(
    () => points.map((point) => ({ time: point.time, value: point.profit })),
    [points]
  );

  // A new page starts without a point preview.
  const [pageIndex, setPageIndex] = useState(0);
  // A new page starts without a point preview.
  const handleScrollEnd = () => setScrubIndex(null);
  // The indicator follows the finger (page past halfway counts as current).
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    const clamped = Math.min(Math.max(index, 0), PAGES.length - 1);
    if (clamped !== pageIndex) setPageIndex(clamped);
  };

  const scrubbed = scrubIndex != null ? points[scrubIndex] : undefined;
  const scrubbedDate = scrubbed ? formatPointDate(scrubbed.time, range === '1D') : null;
  const showSpinner = isLoading && !series;

  const formatBaseMoney = useCallback(
    (value: number) => formatMoney(value, baseCurrency),
    [baseCurrency]
  );
  const formatBaseProfit = useCallback(
    (value: number) => formatSignedMoney(value, baseCurrency),
    [baseCurrency]
  );

  const currentProfit = series?.currentProfit ?? null;
  const profitColor = (currentProfit ?? 0) < 0 ? ChartColors.loss : ChartColors.profit;

  // Invested capital as a second line on the value chart, over longer
  // ranges only: next to a day or a month of moves it would flatten the line.
  const showsCapital = CAPITAL_RANGES.includes(range) && points.length > 1;
  const capitalValues = useMemo(
    () => (showsCapital ? points.map((point) => point.invested) : undefined),
    [points, showsCapital]
  );

  const renderPage = (kind: Page) => {
    const isValue = kind === 'value';
    const scrubbedAmount = scrubbed ? (isValue ? scrubbed.value : scrubbed.profit) : null;
    const amount = scrubbedAmount ?? (isValue ? (series?.currentValue ?? 0) : (currentProfit ?? 0));
    const change = series?.change ?? null;
    const withCapital = isValue && showsCapital;

    const caption = isValue ? valueTitle : 'Twój wynik';

    const detail = (() => {
      if (scrubbedDate) {
        return (
          <Text style={styles.secondary}>
            {withCapital && scrubbed
              ? `${scrubbedDate} · zainwestowano ${formatMoney(scrubbed.invested, baseCurrency)}`
              : scrubbedDate}
          </Text>
        );
      }
      if (isValue) {
        return change != null ? (
          <Text style={[styles.change, { color: changeColor(change) }]}>
            {formatProfit(change, series?.changeRatio ?? null, baseCurrency)}{' '}
            <Text style={styles.secondary}>{RANGE_CHANGE_LABELS[range]}</Text>
          </Text>
        ) : (
          <Text style={styles.secondary}> </Text>
        );
      }
      return (
        <Text style={styles.secondary}>
          {series?.profitRatio != null ? `${formatPercent(series.profitRatio)} łącznie` : ' '}
          {change != null
            ? ` · ${formatSignedMoney(change, baseCurrency)} ${RANGE_CHANGE_LABELS[range]}`
            : ''}
        </Text>
      );
    })();

    return (
      <View key={kind} style={{ width }}>
        <View style={styles.header}>
          <Text style={styles.caption}>{caption}</Text>
          {showSpinner ? (
            // First load: placeholders instead of 0,00 zł.
            <View style={styles.headerSkeleton}>
              <Skeleton width={190} height={32} />
              <Skeleton width={150} height={15} />
            </View>
          ) : (
            <>
              <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
                {isValue
                  ? formatMoney(amount, baseCurrency)
                  : formatSignedMoney(amount, baseCurrency)}
              </Text>
              {detail}
            </>
          )}
        </View>
        <View style={styles.chart}>
          {showSpinner ? (
            <View style={styles.spinner}>
              <Skeleton width="100%" height={180} radius={12} />
            </View>
          ) : (
            <ValueChart
              points={isValue ? valuePoints : profitPoints}
              // Value: the start of the range (or the capital line instead);
              // profit: break-even.
              baseline={isValue ? (withCapital ? null : series?.startValue) : 0}
              secondaryValues={withCapital ? capitalValues : undefined}
              secondaryLabel="zainwestowano"
              range={range}
              color={isValue ? ChartColors.line : profitColor}
              onScrub={setScrubIndex}
              accessibilityLabel={isValue ? `Wykres: ${valueTitle}` : 'Wykres: Twój wynik'}
              formatValue={isValue ? formatBaseMoney : formatBaseProfit}
            />
          )}
          {withCapital && !showSpinner ? (
            <View style={styles.legend} accessible={false}>
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: ChartColors.line }]} />
                <Text style={styles.legendText}>Wartość inwestycji</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendDashed} />
                <Text style={styles.legendText}>Zainwestowany kapitał</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        // Pages are sized from the measured width; until then, keep it invisible
        // so the first frame does not show a wrongly sized layout.
        style={width > 0 ? undefined : styles.hidden}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        accessibilityLabel="Wykresy portfela: wartość i zysk, przesuń w bok, aby przełączyć">
        {PAGES.map(renderPage)}
      </ScrollView>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {PAGES.map((page, index) => (
          <View key={page} style={[styles.dot, index === pageIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.fill,
  },
  dotActive: {
    backgroundColor: Colors.secondaryLabel,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 2,
  },
  caption: {
    fontSize: 15,
    color: Colors.secondaryLabel,
  },
  amount: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  change: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  secondary: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
  chart: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  spinner: {
    height: 204,
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLine: {
    width: 14,
    height: 2.5,
    borderRadius: 1.25,
  },
  legendDashed: {
    width: 14,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.secondaryLabel,
  },
  legendText: {
    fontSize: 12,
    color: Colors.secondaryLabel,
  },
  headerSkeleton: {
    gap: 8,
    paddingTop: 6,
    paddingBottom: 2,
  },
});
