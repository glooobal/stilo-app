import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { Separator } from '@/components/separator';
import { TransactionRow } from '@/components/transaction-row';
import { Colors } from '@/constants/colors';
import type { TransactionWithInstrument } from '@/db/transactions';
import { fromISODate } from '@/lib/date';
import { openTransactionEditor } from '@/lib/navigation';
import {
  filterTransactions,
  hasFilters,
  NO_FILTERS,
  type SideFilter,
  type TransactionFilters,
} from '@/lib/transaction-filters';
import { sortNewestFirst } from '@/lib/transactions';
import { usePortfolioData } from '@/hooks/use-portfolio';

type Section = { title: string; data: TransactionWithInstrument[] };

function monthTitle(date: string) {
  const title = fromISODate(date).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const SIDE_OPTIONS: [SideFilter, string][] = [
  ['all', 'Wszystkie'],
  ['buy', 'Kupno'],
  ['sell', 'Sprzedaż'],
];

/**
 * All operations, newest first, grouped by month, with filters: kind,
 * portfolio and a search by instrument. Shown as a sheet.
 */
export default function HistoryScreen() {
  const { portfolioId } = useLocalSearchParams<{ portfolioId?: string }>();
  const { transactions, saleResults, portfolio, portfolios } = usePortfolioData(portfolioId);
  const portfolioNames = useMemo(
    () =>
      !portfolioId && portfolios.length > 1
        ? new Map(portfolios.map((item) => [item.id, item.name]))
        : undefined,
    [portfolioId, portfolios]
  );

  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS);
  const update = (changes: Partial<TransactionFilters>) =>
    setFilters((previous) => ({ ...previous, ...changes }));
  const isFiltered = hasFilters(filters);
  const showsPortfolioFilter = !portfolioId && portfolios.length > 1;

  const sections = useMemo(() => {
    const result: Section[] = [];
    for (const transaction of sortNewestFirst(filterTransactions(transactions, filters))) {
      const title = monthTitle(transaction.tradedAt);
      const last = result.at(-1);
      if (last?.title === title) last.data.push(transaction);
      else result.push({ title, data: [transaction] });
    }
    return result;
  }, [transactions, filters]);

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
            filters.side !== 'all' || filters.portfolioId
              ? 'line.3.horizontal.decrease.circle.fill'
              : 'line.3.horizontal.decrease.circle'
          }
          accessibilityLabel="Filtruj operacje">
          <Stack.Toolbar.Menu inline title="Rodzaj">
            {SIDE_OPTIONS.map(([side, label]) => (
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
          {filters.side !== 'all' || filters.portfolioId ? (
            <Stack.Toolbar.MenuAction
              icon="xmark.circle"
              onPress={() => update({ side: 'all', portfolioId: null })}>
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
        keyExtractor={(transaction) => transaction.id}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.row,
              index === 0 && styles.first,
              index === section.data.length - 1 && styles.last,
            ]}>
            {index > 0 ? <Separator inset={64} /> : null}
            <TransactionRow
              transaction={item}
              saleResult={saleResults.get(item.id)}
              portfolioName={portfolioNames?.get(item.portfolioId)}
              onPress={() => openTransactionEditor(item.id)}
            />
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isFiltered && transactions.length > 0
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
    paddingTop: 24,
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
  empty: {
    paddingTop: 48,
    textAlign: 'center',
    fontSize: 15,
    color: Colors.secondaryLabel,
  },
});
