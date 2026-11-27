import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ChartColors, Colors } from '@/constants/colors';
import { useBenchmarks } from '@/hooks/use-benchmarks';
import { getBenchmark, parseBenchmarkIds, type BenchmarkId } from '@/lib/benchmarks';
import { formatPointDate } from '@/lib/date';
import { readTextPreference, writePreference } from '@/lib/preferences';
import { formatMoney, formatPercent, formatProfit, formatSignedMoney } from '@/lib/number';
import { RANGE_CHANGE_LABELS } from '@/lib/ranges';
import type { PortfolioSeries } from '@/lib/valuation';
import type { ChartRange } from '@/market/types';

import { BenchmarkMenu } from './benchmark-menu';
import { Skeleton } from './skeleton';
import { ValueChart } from './value-chart';

type Page = 'value' | 'profit' | 'compare';

/** Green for gains, red for losses, neutral for no change. */
function changeColor(change: number) {
  if (change > 0) return Colors.positive;
  if (change < 0) return Colors.negative;
  return Colors.secondaryLabel;
}
const PAGES: Page[] = ['value', 'profit', 'compare'];
/** Ranges whose value chart also shows the invested capital. */
const CAPITAL_RANGES: readonly ChartRange[] = ['YTD', '1Y', '5Y', 'ALL'];
const BENCHMARKS_KEY = 'chart.benchmarks';
const DIVIDENDS_KEY = 'chart.benchmarks.dividends';
const RESULT_INFO =
  'Wynik jest liczony z dywidendami: to zmiana cen i kursów walut, zysk ze sprzedaży oraz otrzymane dywidendy netto (po podatku).\n\n„Łącznie” to wynik podzielony przez największy kapitał zainwestowany naraz. Wynik za okres nie liczy wpłat ani zakupów jako zysku – jest dzielony przez wartość na początku okresu plus wpłaty w tym okresie.';

function compareInfo(withDividends: boolean) {
  const portfolio =
    'Zwrot Twoich inwestycji jest ważony czasem: wpłaty, wypłaty, zakupy i sprzedaże nie zmieniają wyniku.';
  return withDividends
    ? `${portfolio} Dywidendy go zwiększają.\n\nIndeksy liczone są z dywidendami (wersje dochodowe lub ETF-y akumulujące), każdy w swojej walucie, bez przeliczania kursów walut.\n\nMożesz to wyłączyć w menu „Indeksy” → „Wliczaj dywidendy do wyników”.`
    : `${portfolio} Dywidendy nie są liczone – tylko zmiana cen.\n\nIndeksy też liczone są bez dywidend (wersje cenowe), każdy w swojej walucie, bez przeliczania kursów walut. WIG nie ma wersji cenowej, więc zawsze zawiera dywidendy.`;
}

function readBenchmarkPreference(): BenchmarkId[] {
  return parseBenchmarkIds(readTextPreference(BENCHMARKS_KEY));
}

type PortfolioChartPagerProps = {
  /** Caption of the value page, e.g. "Wartość inwestycji" on the summary. */
  valueTitle: string;
  baseCurrency: string;
  series: PortfolioSeries | null;
  /** Range of the data on screen. */
  range: ChartRange;
  isLoading: boolean;
  /** Shown between the charts and the page dots (the range buttons). */
  footer?: ReactNode;
};

/**
 * Swipeable charts in the portfolio panel: value, profit, and the return
 * compared with market indices. Press and hold a chart to see the date and
 * values under the finger in the header.
 */
export function PortfolioChartPager({
  valueTitle,
  baseCurrency,
  series,
  range,
  isLoading,
  footer,
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

  // One switch for the portfolio and every index, so the comparison stays fair.
  const [withDividends, setWithDividends] = useState(
    () => readTextPreference(DIVIDENDS_KEY) !== 'false'
  );
  const changeWithDividends = (value: boolean) => {
    setWithDividends(value);
    writePreference(DIVIDENDS_KEY, String(value));
  };
  const returnPoints = useMemo(
    () =>
      points.map((point) => ({
        time: point.time,
        value: withDividends ? point.returnRatio : point.priceReturnRatio,
      })),
    [points, withDividends]
  );
  const times = useMemo(() => points.map((point) => point.time), [points]);

  const [pageIndex, setPageIndex] = useState(0);
  const [benchmarkIds, setBenchmarkIds] = useState<BenchmarkId[]>(readBenchmarkPreference);
  const changeBenchmarks = (ids: BenchmarkId[]) => {
    setBenchmarkIds(ids);
    writePreference(BENCHMARKS_KEY, ids.join(','));
  };
  // Indices are downloaded once the comparison is first shown.
  const [hasShownCompare, setHasShownCompare] = useState(false);
  const benchmarks = useBenchmarks(
    benchmarkIds,
    range,
    times,
    hasShownCompare,
    withDividends
  );
  const benchmarkSeries = useMemo(
    () =>
      benchmarks.lines.map((line) => ({
        values: line.values,
        color: getBenchmark(line.id).color,
      })),
    [benchmarks.lines]
  );
  // A new page starts without a point preview.
  const handleScrollEnd = () => setScrubIndex(null);
  // The indicator follows the finger (page past halfway counts as current).
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    const clamped = Math.min(Math.max(index, 0), PAGES.length - 1);
    if (clamped !== pageIndex) setPageIndex(clamped);
    if (PAGES[clamped] === 'compare') setHasShownCompare(true);
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
  // The result is green or red (a gain or a loss); the value stays blue.
  const profitColor = (currentProfit ?? 0) < 0 ? ChartColors.loss : ChartColors.profit;
  const valueColor = ChartColors.line;

  // Invested capital as a second line on the value chart, over longer
  // ranges only: next to a day or a month of moves it would flatten the line.
  const showsCapital = CAPITAL_RANGES.includes(range) && points.length > 1;
  const capitalValues = useMemo(
    () => (showsCapital ? points.map((point) => point.invested) : undefined),
    [points, showsCapital]
  );

  const formatRatio = useCallback((value: number) => formatPercent(value), []);

  const renderHeader = (caption: string, accessory?: ReactNode, info?: string) => (
    <View style={styles.captionRow}>
      {info ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Pokazuje, jak to jest liczone"
          hitSlop={8}
          onPress={() =>
            Alert.alert(caption, info, [{ text: 'Rozumiem', style: 'default', isPreferred: true }])
          }
          style={({ pressed }) => [styles.captionButton, pressed && styles.pressed]}>
          <Text style={styles.caption}>{caption}</Text>
          <SymbolView name="info.circle" size={15} tintColor={Colors.secondaryLabel} />
        </Pressable>
      ) : (
        <Text style={styles.caption}>{caption}</Text>
      )}
      {accessory}
    </View>
  );

  const renderSkeleton = () => (
    // First load: placeholders instead of 0,00 zł.
    <View style={styles.headerSkeleton}>
      <Skeleton width={190} height={32} />
      <Skeleton width={150} height={15} />
    </View>
  );

  const renderChartSkeleton = () => (
    <View style={styles.spinner}>
      <Skeleton width="100%" height={180} radius={12} />
    </View>
  );

  const renderCompare = () => {
    const hasCompareData = returnPoints.length >= 2;
    const lastIndex = points.length - 1;
    const index = scrubIndex ?? lastIndex;
    const portfolioReturn = index >= 0 ? (returnPoints[index]?.value ?? null) : null;
    const legend = [
      { key: 'portfolio', name: 'Twoje inwestycje', color: ChartColors.line, value: portfolioReturn },
      ...benchmarks.lines.map((line) => {
        const benchmark = getBenchmark(line.id);
        return {
          key: line.id,
          name: benchmark.name,
          color: benchmark.color,
          value: line.values[index] ?? null,
        };
      }),
    ];
    const missing = benchmarkIds.filter(
      (id) => !benchmarks.lines.some((line) => line.id === id)
    );
    const status = benchmarks.isLoading
      ? 'Wczytuję indeksy…'
      : missing.length > 0 && benchmarks.failed.length > 0
        ? `Nie udało się pobrać: ${missing.map((id) => getBenchmark(id).name).join(', ')}`
        : benchmarkIds.length === 0
          ? 'Wybierz indeksy w menu u góry.'
          : null;

    return (
      <View key="compare" style={{ width }}>
        <View style={styles.header}>
          {renderHeader(
            'Porównanie z indeksami',
            <BenchmarkMenu
              selected={benchmarkIds}
              onChange={changeBenchmarks}
              withDividends={withDividends}
              onWithDividendsChange={changeWithDividends}
            />,
            compareInfo(withDividends)
          )}
          {showSpinner ? (
            renderSkeleton()
          ) : (
            <>
              <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
                {hasCompareData && portfolioReturn != null ? formatPercent(portfolioReturn) : '–'}
              </Text>
              <Text style={styles.secondary}>
                {scrubbedDate ??
                  (hasCompareData
                    ? `Twoje inwestycje ${RANGE_CHANGE_LABELS[range]}${withDividends ? '' : ' (bez dywidend)'}`
                    : 'Brak danych do porównania')}
              </Text>
            </>
          )}
        </View>
        <View style={styles.chart}>
          {showSpinner ? (
            renderChartSkeleton()
          ) : !hasCompareData ? (
            // Nothing invested yet (or nothing in this range): nothing to compare.
            <View style={styles.emptyChart}>
              <Text style={styles.emptyText}>
                Dodaj pierwszą operację, a zobaczysz tu porównanie swoich wyników z indeksami.
              </Text>
            </View>
          ) : (
            <ValueChart
              points={returnPoints}
              baseline={0}
              extraSeries={benchmarkSeries}
              valueFormat="percent"
              showsArea={false}
              range={range}
              color={ChartColors.line}
              onScrub={setScrubIndex}
              accessibilityLabel="Wykres: porównanie z indeksami"
              formatValue={formatRatio}
            />
          )}
          {!showSpinner && hasCompareData ? (
            // One line that scrolls sideways, like the allocation legend.
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.legendScroll}
              contentContainerStyle={styles.compareLegend}>
              {legend.map((item) => (
                <View key={item.key} style={styles.compareItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.compareName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.compareValue,
                      { color: item.value != null ? changeColor(item.value) : Colors.secondaryLabel },
                    ]}>
                    {item.value != null ? formatPercent(item.value) : '–'}
                  </Text>
                </View>
              ))}
              {status ? <Text style={styles.compareStatus}>{status}</Text> : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    );
  };

  const renderPage = (kind: Page) => {
    if (kind === 'compare') return renderCompare();
    const isValue = kind === 'value';
    const scrubbedAmount = scrubbed ? (isValue ? scrubbed.value : scrubbed.profit) : null;
    const amount = scrubbedAmount ?? (isValue ? (series?.currentValue ?? 0) : (currentProfit ?? 0));
    const change = series?.change ?? null;
    const changeRatio = series?.changeRatio ?? null;
    const withCapital = isValue && showsCapital;

    const caption = isValue ? valueTitle : 'Wynik inwestycji';

    const detail = (() => {
      if (scrubbed && scrubbedDate) {
        // The change from the start of the range until the point under the finger.
        return (
          <Text style={[styles.change, { color: changeColor(scrubbed.change) }]}>
            {formatProfit(scrubbed.change, scrubbed.changeRatio, baseCurrency)}{' '}
            <Text style={styles.secondary}>{scrubbedDate}</Text>
          </Text>
        );
      }
      if (isValue) {
        return change != null ? (
          <Text style={[styles.change, { color: changeColor(change) }]}>
            {formatProfit(change, changeRatio, baseCurrency)}{' '}
            <Text style={styles.secondary}>{RANGE_CHANGE_LABELS[range]}</Text>
          </Text>
        ) : (
          <Text style={styles.secondary}> </Text>
        );
      }
      return (
        <Text style={styles.secondary}>
          {series?.profitRatio != null ? `${formatPercent(series.profitRatio)} łącznie` : ' '}
          {change != null ? (
            <>
              {' · '}
              <Text style={[styles.change, { color: changeColor(change) }]}>
                {formatProfit(change, changeRatio, baseCurrency)}
              </Text>{' '}
              {RANGE_CHANGE_LABELS[range]}
            </>
          ) : null}
        </Text>
      );
    })();

    return (
      <View key={kind} style={{ width }}>
        <View style={styles.header}>
          {renderHeader(caption, undefined, isValue ? undefined : RESULT_INFO)}
          {showSpinner ? (
            renderSkeleton()
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
            renderChartSkeleton()
          ) : (
            <ValueChart
              points={isValue ? valuePoints : profitPoints}
              // Value: the start of the range (or the capital line instead);
              // profit: break-even.
              baseline={isValue ? (withCapital ? null : series?.startValue) : 0}
              secondaryValues={withCapital ? capitalValues : undefined}
              secondaryLabel="zainwestowano"
              range={range}
              color={isValue ? valueColor : profitColor}
              onScrub={setScrubIndex}
              accessibilityLabel={isValue ? `Wykres: ${valueTitle}` : 'Wykres: wynik inwestycji'}
              formatValue={isValue ? formatBaseMoney : formatBaseProfit}
            />
          )}
          {withCapital && !showSpinner ? (
            <View style={styles.legend} accessible={false}>
              <View style={styles.legendItem}>
                <View style={[styles.legendLine, { backgroundColor: valueColor }]} />
                <Text style={styles.legendText}>Wartość inwestycji</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendDashed} />
                <Text style={styles.legendText}>
                  {scrubbed
                    ? `Zainwestowano ${formatMoney(scrubbed.invested, baseCurrency)}`
                    : 'Zainwestowany kapitał'}
                </Text>
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
        accessibilityLabel="Wykresy portfela: wartość, wynik i porównanie z indeksami, przesuń w bok, aby przełączyć">
        {PAGES.map(renderPage)}
      </ScrollView>
      {footer}
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
    paddingTop: 12,
    paddingBottom: 8,
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
    paddingTop: 20,
    gap: 4,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  caption: {
    fontSize: 15,
    color: Colors.secondaryLabel,
  },
  legendScroll: {
    flexGrow: 0,
    marginHorizontal: -16,
    marginTop: 6,
  },
  emptyChart: {
    height: 204,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
  compareLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  compareStatus: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
  captionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pressed: {
    opacity: 0.5,
  },
  compareItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compareName: {
    fontSize: 13,
    color: Colors.label,
  },
  compareValue: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
