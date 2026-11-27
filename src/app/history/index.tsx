import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Host } from '@expo/ui/swift-ui';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { CashOperationRow } from '@/components/cash-operation-row';
import { DateField } from '@/components/date-field';
import { DividendRow } from '@/components/dividend-row';
import { Separator } from '@/components/separator';
import { TransactionRow } from '@/components/transaction-row';
import { Colors } from '@/constants/colors';
import type { DividendWithInstrument } from '@/db/dividends';
import type { TransactionWithInstrument } from '@/db/transactions';
import { fromISODate, toISODate } from '@/lib/date';
import { addDays } from '@/lib/dividends';
import type { CashOperation } from '@/lib/cash';
import { dividendInBase, netDividend } from '@/lib/dividends';
import { tradeRate } from '@/lib/fx';
import { readPreference, writePreference } from '@/lib/preferences';
import { openCashEditor, openDividendEditor, openTransactionEditor } from '@/lib/navigation';
import {
  filterCashOperations,
  filterDividends,
  filterTransactions,
  hasFilters,
  NO_FILTERS,
  yearsOf,
  type HistorySort,
  type SideFilter,
  type TransactionFilters,
} from '@/lib/transaction-filters';
import { sortNewestFirst } from '@/lib/transactions';
import { usePortfolioData } from '@/hooks/use-portfolio';

type Item =
  | { kind: 'trade'; date: string; key: string; transaction: TransactionWithInstrument }
  | { kind: 'cash'; date: string; key: string; operation: CashOperation }
  | { kind: 'dividend'; date: string; key: string; dividend: DividendWithInstrument };

type Section = { title: string; data: Item[] };

function monthTitle(date: string) {
  const title = fromISODate(date).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Roughly what the operation moved, in the portfolio currency: for sorting only. */
function itemAmount(item: Item): number {
  switch (item.kind) {
    case 'trade': {
      const { transaction } = item;
      const rate = tradeRate(transaction, transaction.portfolioCurrency) ?? 1;
      return transaction.quantity * transaction.price * rate;
    }
    case 'dividend':
      return (
        dividendInBase(item.dividend, item.dividend.portfolioCurrency, () => null)?.net ??
        netDividend(item.dividend)
      );
    case 'cash':
      return item.operation.amount;
  }
}

const SORT_OPTIONS: [HistorySort, string][] = [
  ['newest', 'Od najnowszych'],
  ['oldest', 'Od najstarszych'],
  ['amount', 'Od największej kwoty'],
];
const SORT_KEY = 'history.sort';

const SIDE_OPTIONS: [SideFilter, string][] = [
  ['all', 'Wszystkie'],
  ['buy', 'Kupno'],
  ['sell', 'Sprzedaż'],
  ['dividend', 'Dywidendy'],
  ['cash', 'Wpłaty i wypłaty'],
];

/**
 * All operations, newest first, grouped by month, with filters: kind,
 * portfolio and a search by instrument. Shown as a sheet.
 */
export default function HistoryScreen() {
  const { portfolioId } = useLocalSearchParams<{ portfolioId?: string }>();
  const { transactions, saleResults, portfolio, portfolios, cashOperations, dividends } =
    usePortfolioData(portfolioId);
  const hasCash = cashOperations.length > 0 || portfolios.some((item) => item.isCash);
  const currencies = useMemo(
    () => new Map(portfolios.map((item) => [item.id, item.baseCurrency])),
    [portfolios]
  );
  const portfolioNames = useMemo(
    () =>
      !portfolioId && portfolios.length > 1
        ? new Map(portfolios.map((item) => [item.id, item.name]))
        : undefined,
    [portfolioId, portfolios]
  );

  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS);
  const [sort, setSortState] = useState<HistorySort>(() =>
    readPreference(
      SORT_KEY,
      SORT_OPTIONS.map(([value]) => value),
      'newest'
    )
  );
  const setSort = (value: HistorySort) => {
    setSortState(value);
    writePreference(SORT_KEY, value);
  };
  const years = useMemo(
    () =>
      yearsOf([
        ...transactions.map((item) => item.tradedAt),
        ...dividends.map((item) => item.paidAt),
        ...cashOperations.map((item) => item.date),
      ]),
    [transactions, dividends, cashOperations]
  );
  const hasRange = filters.from != null || filters.to != null;
  const hasMenuFilters =
    filters.side !== 'all' || filters.portfolioId != null || filters.year != null || hasRange;
  // The last month to start with; the dates can then be changed above the list.
  const showRange = () => {
    const today = toISODate(new Date());
    update({ from: addDays(today, -30), to: today });
  };
  const changeFrom = (date: Date) => {
    const from = toISODate(date);
    update({ from, to: filters.to != null && filters.to < from ? from : filters.to });
  };
  const changeTo = (date: Date) => {
    const to = toISODate(date);
    update({ to, from: filters.from != null && filters.from > to ? to : filters.from });
  };
  const update = (changes: Partial<TransactionFilters>) =>
    setFilters((previous) => ({ ...previous, ...changes }));
  const isFiltered = hasFilters(filters);
  const showsPortfolioFilter = !portfolioId && portfolios.length > 1;

  const sections = useMemo(() => {
    const items: Item[] = [
      ...sortNewestFirst(filterTransactions(transactions, filters)).map(
        (transaction): Item => ({
          kind: 'trade',
          date: transaction.tradedAt,
          key: transaction.id,
          transaction,
        })
      ),
      ...filterCashOperations(cashOperations, filters).map(
        (operation): Item => ({ kind: 'cash', date: operation.date, key: operation.id, operation })
      ),
      ...filterDividends(dividends, filters).map(
        (dividend): Item => ({ kind: 'dividend', date: dividend.paidAt, key: dividend.id, dividend })
      ),
    ];
    if (sort === 'amount') {
      // One list, largest first: months would only split it up.
      items.sort((a, b) => Math.abs(itemAmount(b)) - Math.abs(itemAmount(a)));
      return items.length > 0 ? [{ title: 'Od największej kwoty', data: items }] : [];
    }
    // By date; the sort keeps the order of trades within a day.
    const direction = sort === 'oldest' ? -1 : 1;
    items.sort((a, b) => (a.date < b.date ? direction : a.date > b.date ? -direction : 0));
    if (sort === 'oldest') {
      // Trades of one day were newest first; turn them round as well.
      const byDate = new Map<string, Item[]>();
      for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
      items.splice(0, items.length, ...[...byDate.values()].flatMap((day) => day.reverse()));
    }
    const result: Section[] = [];
    for (const item of items) {
      const title = monthTitle(item.date);
      const last = result.at(-1);
      if (last?.title === title) last.data.push(item);
      else result.push({ title, data: [item] });
    }
    return result;
  }, [transactions, cashOperations, dividends, filters, sort]);

  return (
    <>
      <Stack.Title>{portfolio ? `Historia: ${portfolio.name}` : 'Historia operacji'}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Zamknij" onPress={() => router.back()}>
          Zamknij
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          icon={
            hasMenuFilters || sort !== 'newest'
              ? 'line.3.horizontal.decrease.circle.fill'
              : 'line.3.horizontal.decrease.circle'
          }
          accessibilityLabel="Filtruj i sortuj operacje">
          <Stack.Toolbar.Menu inline title="Sortowanie">
            {SORT_OPTIONS.map(([value, label]) => (
              <Stack.Toolbar.MenuAction
                key={value}
                isOn={sort === value}
                onPress={() => setSort(value)}>
                {label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu inline title="Rodzaj">
            {SIDE_OPTIONS.filter(([side]) => side !== 'cash' || hasCash).map(([side, label]) => (
              <Stack.Toolbar.MenuAction
                key={side}
                isOn={filters.side === side}
                onPress={() => update({ side })}>
                {label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          {showsPortfolioFilter ? (
            <Stack.Toolbar.Menu inline title="Portfel">
              <Stack.Toolbar.MenuAction
                isOn={filters.portfolioId == null}
                onPress={() => update({ portfolioId: null })}>
                Wszystkie portfele
              </Stack.Toolbar.MenuAction>
              {portfolios.map((item) => (
                <Stack.Toolbar.MenuAction
                  key={item.id}
                  isOn={filters.portfolioId === item.id}
                  onPress={() => update({ portfolioId: item.id })}>
                  {item.name}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          ) : null}
          {years.length > 1 ? (
            <Stack.Toolbar.Menu title={filters.year != null ? `Rok: ${filters.year}` : 'Rok'}>
              <Stack.Toolbar.MenuAction
                isOn={filters.year == null}
                onPress={() => update({ year: null })}>
                Wszystkie lata
              </Stack.Toolbar.MenuAction>
              {years.map((year) => (
                <Stack.Toolbar.MenuAction
                  key={year}
                  isOn={filters.year === year}
                  onPress={() => update({ year })}>
                  {String(year)}
                </Stack.Toolbar.MenuAction>
              ))}
            </Stack.Toolbar.Menu>
          ) : null}
          <Stack.Toolbar.MenuAction
            icon="calendar"
            isOn={hasRange}
            onPress={() => (hasRange ? update({ from: null, to: null }) : showRange())}>
            Zakres dat
          </Stack.Toolbar.MenuAction>
          {hasMenuFilters ? (
            <Stack.Toolbar.MenuAction
              icon="xmark.circle"
              onPress={() =>
                update({ side: 'all', portfolioId: null, year: null, from: null, to: null })
              }>
              Wyczyść filtry
            </Stack.Toolbar.MenuAction>
          ) : null}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Stack.SearchBar
        placement="automatic"
        placeholder="Szukaj waloru"
        autoCapitalize="none"
        onChangeText={(event) => update({ query: event.nativeEvent.text })}
        onCancelButtonPress={() => update({ query: '' })}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.row,
              index === 0 && styles.first,
              index === section.data.length - 1 && styles.last,
            ]}>
            {index > 0 ? <Separator inset={64} /> : null}
            {item.kind === 'trade' ? (
              <TransactionRow
                transaction={item.transaction}
                saleResult={saleResults.get(item.transaction.id)}
                portfolioName={portfolioNames?.get(item.transaction.portfolioId)}
                onPress={() => openTransactionEditor(item.transaction.id)}
              />
            ) : item.kind === 'dividend' ? (
              <DividendRow
                dividend={{
                  ...item.dividend,
                  // In the portfolio currency, at the rate stored with the payment.
                  amounts: dividendInBase(item.dividend, item.dividend.portfolioCurrency, () => null),
                }}
                baseCurrency={item.dividend.portfolioCurrency}
                detailText="Wypłata dywidendy"
                portfolioName={portfolioNames?.get(item.dividend.portfolioId)}
                onPress={() => openDividendEditor(item.dividend.id)}
              />
            ) : (
              <CashOperationRow
                operation={item.operation}
                currency={currencies.get(item.operation.portfolioId) ?? ''}
                portfolioName={portfolioNames?.get(item.operation.portfolioId)}
                onPress={() => openCashEditor(item.operation.id)}
              />
            )}
          </View>
        )}
        ListHeaderComponent={
          hasRange ? (
            // From – to, with native date pickers; the list follows at once.
            <View style={styles.range}>
              <View style={styles.rangeRow}>
                <Text style={styles.rangeLabel}>Od</Text>
                <Host matchContents>
                  <DateField
                    label=""
                    value={fromISODate(filters.from ?? filters.to ?? toISODate(new Date()))}
                    maximumDate={new Date()}
                    onChange={changeFrom}
                  />
                </Host>
              </View>
              <View style={styles.rangeSeparator} />
              <View style={styles.rangeRow}>
                <Text style={styles.rangeLabel}>Do</Text>
                <Host matchContents>
                  <DateField
                    label=""
                    value={fromISODate(filters.to ?? toISODate(new Date()))}
                    maximumDate={new Date()}
                    onChange={changeTo}
                  />
                </Host>
              </View>
              <View style={styles.rangeSeparator} />
              <Pressable
                accessibilityRole="button"
                onPress={() => update({ from: null, to: null })}
                style={({ pressed }) => [styles.rangeRow, pressed && styles.pressed]}>
                <Text style={styles.rangeClear}>Usuń zakres dat</Text>
              </Pressable>
            </View>
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isFiltered && transactions.length + cashOperations.length + dividends.length > 0
              ? 'Brak operacji pasujących do filtrów.'
              : 'Brak transakcji.'}
          </Text>
        }
        stickySectionHeadersEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.list}
        contentContainerStyle={styles.content}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: Colors.groupedBackground,
  },
  content: {
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 8,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.secondaryLabel,
  },
  row: {
    marginHorizontal: 16,
    backgroundColor: Colors.card,
    overflow: 'hidden',
  },
  first: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 4,
  },
  last: {
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingBottom: 4,
  },
  range: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: Colors.card,
    overflow: 'hidden',
  },
  rangeRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  rangeLabel: {
    fontSize: 17,
    color: Colors.label,
  },
  rangeSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: Colors.separator,
  },
  rangeClear: {
    fontSize: 17,
    color: Colors.negative,
  },
  pressed: {
    backgroundColor: Colors.fill,
  },
  empty: {
    paddingTop: 48,
    textAlign: 'center',
    fontSize: 15,
    color: Colors.secondaryLabel,
  },
});
