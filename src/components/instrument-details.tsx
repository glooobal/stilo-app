import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';
import { useInstrumentHistory } from '@/hooks/use-instrument-history';
import { usePortfolios } from '@/hooks/use-portfolio';
import { usePortfolioValuation } from '@/hooks/use-portfolio-valuation';
import { formatDisplayDate, formatPointDate, toISODate } from '@/lib/date';
import { openTransactionEditor } from '@/lib/navigation';
import {
  AVERAGE_PRICE_DIGITS,
  formatDecimalInput,
  formatMoney,
  formatPrice,
  formatProfit,
} from '@/lib/number';
import type { Position, SaleResult } from '@/lib/positions';
import { RANGE_CHANGE_LABELS } from '@/lib/ranges';
import { useSummaryCurrency } from '@/lib/settings';
import { sortNewestFirst } from '@/lib/transactions';
import type { ChartRange, Instrument } from '@/market/types';

import { AddTransactionMenu } from './add-transaction-menu';
import { Card } from './card';
import { InstrumentLogo } from './instrument-logo';
import { RangePicker } from './range-picker';
import { Separator } from './separator';
import { TransactionRow } from './transaction-row';
import { ValueChart } from './value-chart';

/**
 * Instrument screen content: price and chart, and when the user holds (or
 * held) it, the position and its transactions. Used for positions and for
 * instruments opened from search.
 */
export function InstrumentDetails({
  instrument,
  position,
  saleResults,
  portfolioId,
}: {
  instrument: Instrument;
  /** The user's position, if any. */
  position?: Position;
  saleResults: Map<string, SaleResult>;
  /** Set when opened from a portfolio: the position is limited to it. */
  portfolioId?: string;
}) {
  const [range, setRange] = useState<ChartRange>('1M');
  const {
    points: history,
    startPrice,
    quote,
    displayedRange,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } =
    useInstrumentHistory(instrument.symbol, range);

  const marketPrice = quote?.price ?? quote?.points.at(-1)?.close ?? null;
  const points = useMemo(
    () => history.map((point) => ({ time: point.time, value: point.close })),
    [history]
  );
  const baseline = startPrice;
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const priceCurrency = instrument.currency || quote?.currency || '';
  const formatChartPrice = useCallback(
    (value: number) => formatPrice(value, priceCurrency),
    [priceCurrency]
  );
  const scrubbed = scrubIndex != null ? points[scrubIndex] : undefined;
  const change = marketPrice != null && baseline ? marketPrice - baseline : null;
  const changeRatio = change != null && baseline ? change / baseline : null;
  const isPositive = (change ?? 0) >= 0;

  const quantity = position?.quantity ?? 0;
  const openCost = position?.openCost ?? 0;
  // Instruments from search are not saved yet; then the quote knows the currency.
  const currency = priceCurrency;

  // A foreign position is also shown in the portfolio currency (the summary
  // currency for all portfolios together), at the exchange rates of the purchases.
  const portfolios = usePortfolios();
  const summaryCurrency = useSummaryCurrency();
  const baseCurrency =
    (portfolioId ? portfolios.find((item) => item.id === portfolioId)?.baseCurrency : null) ??
    summaryCurrency;
  const isForeign = position != null && currency !== '' && currency !== baseCurrency;
  const valuedPositions = useMemo(() => (position ? [position] : []), [position]);
  const { valuations } = usePortfolioValuation(valuedPositions, '1D', baseCurrency, {
    withHistory: false,
  });
  const baseValuation = valuations.get(instrument.symbol);
  const realized = isForeign ? (baseValuation?.baseRealizedProfit ?? null) : (position?.realizedProfit ?? null);
  const realizedCurrency = isForeign ? baseCurrency : currency;

  // Without market data (e.g. delisted) the position is valued at the price
  // of its last trade, and the screen says so.
  const isTradePrice = marketPrice == null && baseValuation?.priceSource === 'trade';
  const price = marketPrice ?? baseValuation?.price ?? null;
  const value = price != null ? price * quantity : null;
  const unrealized = value != null && quantity > 0 ? value - openCost : null;
  const unrealizedRatio = unrealized != null && openCost > 0 ? unrealized / openCost : null;

  const newestFirst = useMemo(
    () => (position ? sortNewestFirst(position.transactions) : []),
    [position]
  );

  const stats: [label: string, value: string, tone?: 'positive' | 'negative'][] = position
    ? [
        ['Ilość', `${formatDecimalInput(quantity)} szt.`],
        [
          'Średnia cena zakupu',
          quantity ? formatPrice(position.averagePrice, currency, AVERAGE_PRICE_DIGITS) : '—',
        ],
        ['Koszt zakupu', quantity ? formatMoney(openCost, currency) : '—'],
        ['Wartość', value != null && quantity ? formatMoney(value, currency) : '—'],
        [
          'Zysk niezrealizowany',
          unrealized != null ? formatProfit(unrealized, unrealizedRatio, currency) : '—',
          unrealized != null ? (unrealized < 0 ? 'negative' : 'positive') : undefined,
        ],
        ...(isForeign && quantity > 0
          ? ([
              [
                `Koszt zakupu (${baseCurrency})`,
                baseValuation?.baseCost != null
                  ? formatMoney(baseValuation.baseCost, baseCurrency)
                  : '—',
              ],
              [
                `Wartość (${baseCurrency})`,
                baseValuation?.baseValue != null
                  ? formatMoney(baseValuation.baseValue, baseCurrency)
                  : '—',
              ],
              [
                `Zysk z kursem (${baseCurrency})`,
                baseValuation?.baseProfit != null
                  ? formatProfit(
                      baseValuation.baseProfit,
                      baseValuation.baseProfitRatio,
                      baseCurrency
                    )
                  : '—',
                baseValuation?.baseProfit != null
                  ? baseValuation.baseProfit < 0
                    ? 'negative'
                    : 'positive'
                  : undefined,
              ],
            ] satisfies [string, string, ('positive' | 'negative')?][])
          : []),
        [
          // Sales at the rates of their trades, like the rest of the portfolio.
          isForeign ? `Zysk zrealizowany (${realizedCurrency})` : 'Zysk zrealizowany',
          realized != null ? formatProfit(realized, null, realizedCurrency) : '—',
          realized != null && realized > 0
            ? 'positive'
            : realized != null && realized < 0
              ? 'negative'
              : undefined,
        ],
      ]
    : [];

  return (
    <>
      <Stack.Title>{instrument.name}</Stack.Title>
      <AddTransactionMenu instrument={instrument} portfolioId={portfolioId} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}>
        <Card>
          <View style={styles.header}>
            <InstrumentLogo symbol={instrument.symbol} name={instrument.name} size={48} />
            <View style={styles.headerText}>
              <Text numberOfLines={2} style={styles.name}>
                {instrument.name}
              </Text>
              <Text style={styles.meta}>
                {instrument.symbol} · {instrument.exchangeName}
              </Text>
            </View>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>
              {scrubbed
                ? formatPrice(scrubbed.value, currency)
                : price != null
                  ? formatPrice(price, currency)
                  : '—'}
            </Text>
            {scrubbed ? (
              <Text style={styles.changeRange}>
                {formatPointDate(scrubbed.time, displayedRange === '1D')}
              </Text>
            ) : isTradePrice && baseValuation?.priceTime != null ? (
              <Text style={styles.staleNote}>
                {`Brak notowań – cena z ostatniej transakcji (${formatDisplayDate(toISODate(new Date(baseValuation.priceTime)))})`}
              </Text>
            ) : change != null ? (
              <Text
                style={[styles.change, { color: isPositive ? Colors.positive : Colors.negative }]}>
                {formatProfit(change, changeRatio, currency)}{' '}
                <Text style={styles.changeRange}>{RANGE_CHANGE_LABELS[displayedRange]}</Text>
              </Text>
            ) : null}
          </View>
          <View style={styles.chart}>
            {points.length > 1 ? (
              <ValueChart
                points={points}
                baseline={baseline}
                range={displayedRange}
                onScrub={setScrubIndex}
                accessibilityLabel={`Wykres ceny ${instrument.name}`}
                formatValue={formatChartPrice}
              />
            ) : (
              <View style={styles.chartPlaceholder}>
                <Text style={styles.note}>
                  {isLoading ? 'Ładowanie notowań…' : (error ?? 'Brak danych dla tego okresu.')}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.picker}>
            <RangePicker value={range} onChange={setRange} />
          </View>
        </Card>

        {position ? (
          <>
            <Card title="Twoja pozycja">
              {stats.map(([label, text, tone], index) => (
                <View key={label}>
                  {index > 0 ? <Separator /> : null}
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>{label}</Text>
                    <Text
                      style={[
                        styles.statValue,
                        tone === 'positive' && { color: Colors.positive },
                        tone === 'negative' && { color: Colors.negative },
                      ]}>
                      {text}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={styles.bottomSpace} />
            </Card>

            <Card title="Transakcje">
              {newestFirst.map((transaction, index) => (
                <View key={transaction.id}>
                  {index > 0 ? <Separator inset={56} /> : null}
                  <TransactionRow
                    transaction={transaction}
                    saleResult={saleResults.get(transaction.id)}
                    showInstrument={false}
                    onPress={() => openTransactionEditor(transaction.id)}
                  />
                </View>
              ))}
              <View style={styles.bottomSpace} />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    backgroundColor: Colors.groupedBackground,
  },
  content: {
    gap: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.label,
  },
  meta: {
    fontSize: 13,
    color: Colors.secondaryLabel,
  },
  priceBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 2,
  },
  price: {
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
  staleNote: {
    fontSize: 15,
    color: Colors.warning,
  },
  changeRange: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.secondaryLabel,
  },
  chart: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  chartPlaceholder: {
    height: 204,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    padding: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 17,
    color: Colors.label,
  },
  statValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 17,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
  bottomSpace: {
    height: 6,
  },
});
