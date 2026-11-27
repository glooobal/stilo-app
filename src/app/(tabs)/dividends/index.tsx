import { Host, Picker } from '@expo/ui';
import { router, Stack } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AddPortfolioCard } from '@/components/add-portfolio-card';
import { Confetti } from '@/components/confetti';
import { Card } from '@/components/card';
import { DividendGoalCard } from '@/components/dividend-goal-card';
import { DividendMonthChart } from '@/components/dividend-month-chart';
import { DividendRow } from '@/components/dividend-row';
import { InstrumentLogo } from '@/components/instrument-logo';
import { Separator } from '@/components/separator';
import { TabScreen } from '@/components/tab-screen';
import { Colors } from '@/constants/colors';
import { useDividendsOverview } from '@/hooks/use-dividends-overview';
import { useFxRate } from '@/hooks/use-fx-rate';
import { formatDisplayDate } from '@/lib/date';
import {
  goalActual,
  goalProgress,
  markGoalCelebrated,
  useDividendGoal,
  wasGoalCelebrated,
} from '@/lib/dividend-goal';
import { haptic } from '@/lib/haptics';
import { openDividendEditor, openNewDividend } from '@/lib/navigation';
import { formatDecimalInput, formatMoney, formatPercent, formatPrice } from '@/lib/number';
import { formatSyncStatus } from '@/lib/quotes-status';

/**
 * Dividends: received per month of a year, the next 12 months estimated,
 * the upcoming payments and the dividend yield of every position.
 */
/** "3 wypłaty", "5 wypłat", "1 wypłata" (Polish plural forms: one, few, many). */
function countLabel(count: number, [one, few, many]: [string, string, string]): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    count === 1 ? one : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
  return `${count} ${word}`;
}

export default function DividendsScreen() {
  const overview = useDividendsOverview();
  const { baseCurrency, yearSummary, upcoming, positions, year } = overview;
  const now = new Date();
  const goal = useDividendGoal();
  // The goal may be in another currency than the main one.
  const goalRate = useFxRate(baseCurrency, goal?.currency ?? baseCurrency);
  const receivedForGoal =
    goalRate != null ? overview.receivedLast12Months * goalRate : null;
  const isGoalReached =
    goal != null &&
    receivedForGoal != null &&
    goalProgress(goal, goalActual(goal, receivedForGoal)) >= 1;
  const [confettiKey, setConfettiKey] = useState(0);

  // A goal reached for the first time is celebrated once (confetti and a haptic).
  useEffect(() => {
    if (!goal || !isGoalReached || overview.isLoading || wasGoalCelebrated(goal)) return;
    markGoalCelebrated(goal);
    setConfettiKey((key) => key + 1);
    haptic('success');
  }, [goal, isGoalReached, overview.isLoading]);
  const portfolioNames =
    overview.portfolios.length > 1
      ? new Map(overview.portfolios.map((item) => [item.id, item.name]))
      : undefined;

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          variant="prominent"
          accessibilityLabel="Dodaj dywidendę"
          onPress={() => openNewDividend()}>
          Dodaj dywidendę
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <TabScreen
        title="Dywidendy"
        subtitle={
          overview.hasPositions ? formatSyncStatus(overview.updatedAt, overview.syncError) : null
        }
        backgroundColor={Colors.groupedBackground}
        onRefresh={overview.hasPositions ? overview.refresh : undefined}
        isRefreshing={overview.isRefreshing}>
        {!overview.hasPortfolios ? (
          <View style={styles.content}>
            <AddPortfolioCard />
          </View>
        ) : (
          <View style={styles.content}>
            {confettiKey > 0 ? <Confetti key={confettiKey} /> : null}
            <DividendGoalCard
              goal={goal}
              receivedLast12Months={receivedForGoal ?? 0}
            />
            <Card>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryText}>
                  <Text style={styles.caption}>{`Otrzymane w ${year}`}</Text>
                  <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
                    {formatMoney(yearSummary.net, baseCurrency)}
                  </Text>
                  <Text style={styles.secondary}>
                    {yearSummary.list.length > 0
                      ? `${countLabel(yearSummary.list.length, ['wypłata', 'wypłaty', 'wypłat'])} z ${countLabel(yearSummary.companies, ['spółki', 'spółek', 'spółek'])}`
                      : 'Brak wypłat'}
                  </Text>
                  {yearSummary.changeRatio != null ? (
                    <Text
                      style={[
                        styles.secondary,
                        styles.change,
                        {
                          color:
                            yearSummary.changeRatio < 0 ? Colors.negative : Colors.positive,
                        },
                      ]}>
                      {`${formatPercent(yearSummary.changeRatio)} `}
                      <Text style={styles.secondary}>
                        {yearSummary.isCurrentYear
                          ? `niż rok temu o tej porze`
                          : `niż w ${year - 1}`}
                      </Text>
                    </Text>
                  ) : null}
                </View>
                {overview.years.length > 1 ? (
                  <Host matchContents>
                    <Picker
                      selectedValue={String(year)}
                      onValueChange={(value) => overview.setYear(Number(value))}
                      appearance="menu"
                      accessibilityLabel="Rok">
                      {overview.years.map((item) => (
                        <Picker.Item key={item} label={String(item)} value={String(item)} />
                      ))}
                    </Picker>
                  </Host>
                ) : null}
              </View>
              <DividendMonthChart
                months={yearSummary.months}
                currency={baseCurrency}
                currentMonth={year === now.getFullYear() ? now.getMonth() : null}
              />
            </Card>

            {/* The 12-month forecast card is hidden for now (the data is still computed). */}

            {upcoming.length > 0 ? (
              <Card title="Przyszłe dywidendy">
                {upcoming.map((item, index) => {
                  const position = positions.find(
                    (entry) => entry.position.instrument.symbol === item.symbol
                  )?.position;
                  const name = position?.instrument.name ?? item.symbol;
                  return (
                    <Fragment key={`${item.portfolioId}|${item.symbol}|${item.expectedDate}`}>
                      {index > 0 ? <Separator inset={64} /> : null}
                      <View style={styles.row}>
                        <InstrumentLogo symbol={item.symbol} name={name} size={36} />
                        <View style={styles.rowMain}>
                          <Text numberOfLines={1} style={styles.rowTitle}>
                            {name}
                          </Text>
                          <Text numberOfLines={1} style={styles.rowDetail}>
                            {`${item.isDeclared ? 'wypłata ' : ''}ok. ${formatDisplayDate(item.expectedDate)} · ${formatDecimalInput(item.quantity)} szt. × ${formatPrice(item.perShare, item.currency)}`}
                          </Text>
                        </View>
                        <Text style={styles.rowAmount}>
                          {item.netBase != null ? formatMoney(item.netBase, baseCurrency) : '—'}
                        </Text>
                      </View>
                    </Fragment>
                  );
                })}
                <Text style={[styles.note, styles.cardNote]}>
                  Daty wypłat są szacowane
                </Text>
              </Card>
            ) : null}

            {positions.length > 0 ? (
              <Card title="Stopa dywidendy">
                {positions.map((item, index) => (
                  <Fragment key={item.position.instrument.symbol}>
                    {index > 0 ? <Separator inset={64} /> : null}
                    <Pressable
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.position.instrument.name}: bazowa stopa dywidendy ${item.yield != null ? formatPercent(item.yield, false) : 'nieznana'}, twoja stopa ${item.yieldOnCost != null ? formatPercent(item.yieldOnCost, false) : 'nieznana'}`}
                      onPress={() =>
                        router.push({
                          pathname: '/dividends/position/[symbol]',
                          params: { symbol: item.position.instrument.symbol },
                        })
                      }>
                      <InstrumentLogo
                        symbol={item.position.instrument.symbol}
                        name={item.position.instrument.name}
                        size={36}
                      />
                      <View style={styles.rowMain}>
                        <Text numberOfLines={1} style={styles.rowTitle}>
                          {item.position.instrument.name}
                        </Text>
                        <Text numberOfLines={1} style={styles.rowDetail}>
                          {`bazowa stopa ${item.yield != null ? formatPercent(item.yield, false) : '—'}`}
                        </Text>
                        <Text numberOfLines={1} style={styles.rowDetail}>
                          {`twoja stopa ${item.yieldOnCost != null ? formatPercent(item.yieldOnCost, false) : '—'}`}
                        </Text>
                      </View>
                      <View style={styles.rowTrailing}>
                        <Text style={styles.rowAmount}>
                          {item.annualGross != null ? formatMoney(item.annualGross, baseCurrency) : '—'}
                        </Text>
                        <Text style={styles.rowDetail}>rocznie brutto</Text>
                      </View>
                    </Pressable>
                  </Fragment>
                ))}
              </Card>
            ) : null}

            <Card title={`Wypłaty w ${year}`}>
              {yearSummary.list.length === 0 ? (
                <Text style={[styles.note, styles.empty]}>
                  {overview.hasPositions
                    ? 'Brak dywidend w tym roku. Aplikacja wylicza je sama z Twoich akcji; możesz też dodać je ręcznie lub zaimportować z XTB.'
                    : 'Dodaj zakup akcji, a aplikacja sama wyliczy dywidendy.'}
                </Text>
              ) : (
                yearSummary.list.map((dividend, index) => (
                  <Fragment key={dividend.id}>
                    {index > 0 ? <Separator inset={64} /> : null}
                    <DividendRow
                      dividend={dividend}
                      baseCurrency={baseCurrency}
                      portfolioName={portfolioNames?.get(dividend.portfolioId)}
                      onPress={() => openDividendEditor(dividend.id)}
                    />
                  </Fragment>
                ))
              )}
              <View style={styles.bottomSpace} />
            </Card>
          </View>
        )}
      </TabScreen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 28,
    paddingTop: 12,
    paddingBottom: 32,
  },
  change: {
    fontWeight: '600',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  summaryText: {
    flex: 1,
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
  secondary: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
  block: {
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  forecast: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: 12,
    color: Colors.secondaryLabel,
    marginTop: 4,
  },
  cardNote: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
  empty: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
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
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 17,
    color: Colors.label,
  },
  rowDetail: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    fontVariant: ['tabular-nums'],
  },
  rowTrailing: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rowAmount: {
    fontSize: 17,
    color: Colors.label,
    fontVariant: ['tabular-nums'],
  },
  bottomSpace: {
    height: 4,
  },
});
