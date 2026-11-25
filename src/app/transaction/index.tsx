import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  PlatformColor,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { INSTRUMENT_LOGO_SIZE, InstrumentRow } from '@/components/instrument-row';
import { getRecentInstruments, searchSavedInstruments } from '@/db/instruments';
import type { TransactionSide } from '@/db/transactions';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { formatDecimalInput } from '@/lib/number';
import type { InstrumentSearchResult } from '@/market';
import { POPULAR_INSTRUMENTS } from '@/market/popular';
import { MIN_QUERY_LENGTH, useInstrumentSearch } from '@/market/use-instrument-search';

type Row = {
  instrument: InstrumentSearchResult;
  detail?: string;
};

type Section = {
  title: string;
  data: Row[];
};

function matchesQuery(instrument: InstrumentSearchResult, query: string) {
  const needle = query.toLowerCase();
  return (
    instrument.symbol.toLowerCase().includes(needle) ||
    instrument.name.toLowerCase().includes(needle)
  );
}

export default function PickInstrumentScreen() {
  const params = useLocalSearchParams<{ side?: string; portfolioId?: string }>();
  const side: TransactionSide = params.side === 'sell' ? 'sell' : 'buy';
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();

  // Opened from a portfolio: its positions only, and the form stays in it.
  const { openPositions } = usePortfolioData(params.portfolioId);
  const holdings = useMemo(
    () => openPositions.map((position) => ({ ...position.instrument, quantity: position.quantity })),
    [openPositions]
  );
  const recent = useMemo(() => getRecentInstruments(), []);
  const saved = useMemo(
    () => (side === 'buy' && trimmedQuery ? searchSavedInstruments(trimmedQuery) : []),
    [side, trimmedQuery]
  );
  // Selling only concerns owned positions, so it never needs the network.
  const remote = useInstrumentSearch(trimmedQuery, side === 'buy');

  const sections = useMemo<Section[]>(() => {
    const holdingRows: Row[] = holdings
      .filter((holding) => !trimmedQuery || matchesQuery(holding, trimmedQuery))
      .map((holding) => ({
        instrument: holding,
        detail: `${formatDecimalInput(holding.quantity)} szt.`,
      }));

    if (side === 'sell') {
      return holdingRows.length ? [{ title: 'Twoje pozycje', data: holdingRows }] : [];
    }

    if (!trimmedQuery) {
      const held = new Set(holdings.map((holding) => holding.symbol));
      const recentRows = recent
        .filter((instrument) => !held.has(instrument.symbol))
        .map((instrument) => ({ instrument }));
      // Suggestions, without instruments already listed above.
      const listed = new Set([...held, ...recent.map((instrument) => instrument.symbol)]);
      const popularRows = POPULAR_INSTRUMENTS.filter(
        (instrument) => !listed.has(instrument.symbol)
      ).map((instrument) => ({ instrument }));
      return [
        { title: 'Twoje pozycje', data: holdingRows },
        { title: 'Ostatnio wybierane', data: recentRows },
        { title: 'Najpopularniejsze walory', data: popularRows },
      ].filter((section) => section.data.length > 0);
    }

    const savedSymbols = new Set(saved.map((instrument) => instrument.symbol));
    const results = [
      ...saved,
      ...remote.results.filter((instrument) => !savedSymbols.has(instrument.symbol)),
    ];
    return results.length
      ? [{ title: 'Wyniki', data: results.map((instrument) => ({ instrument })) }]
      : [];
  }, [side, trimmedQuery, holdings, recent, saved, remote.results]);

  const openForm = (instrument: InstrumentSearchResult) => {
    router.push({
      pathname: '/transaction/form',
      params: {
        side,
        symbol: instrument.symbol,
        name: instrument.name,
        exchange: instrument.exchange,
        exchangeName: instrument.exchangeName,
        type: instrument.type,
        ...(params.portfolioId ? { portfolioId: params.portfolioId } : {}),
      },
    });
  };

  const emptyMessage = (() => {
    if (side === 'sell') {
      return trimmedQuery
        ? 'Brak pasujących pozycji.'
        : 'Nie masz jeszcze żadnych pozycji do sprzedania.';
    }
    if (!trimmedQuery) return 'Wyszukaj spółkę lub ETF po nazwie albo symbolu.';
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return 'Wpisz co najmniej 2 znaki.';
    if (remote.isLoading) return null;
    if (remote.error) return remote.error;
    return 'Nic nie znaleziono.';
  })();

  return (
    <>
      <Stack.Title>{side === 'buy' ? 'Kupno' : 'Sprzedaż'}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={() => router.back()}>
          Anuluj
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.SearchBar
        placeholder={side === 'buy' ? 'Szukaj spółek i ETF-ów' : 'Szukaj w pozycjach'}
        autoCapitalize="none"
        hideWhenScrolling={false}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.instrument.symbol}
        renderItem={({ item }) => (
          <InstrumentRow
            instrument={item.instrument}
            detail={item.detail}
            onPress={() => openForm(item.instrument)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          emptyMessage ? <Text style={styles.message}>{emptyMessage}</Text> : undefined
        }
        ListFooterComponent={
          remote.isLoading && side === 'buy' ? <ActivityIndicator style={styles.loader} /> : undefined
        }
        stickySectionHeadersEnabled={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      />
    </>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const color = (ios: string, fallback: string) =>
  Platform.OS === 'ios' ? PlatformColor(ios) : fallback;

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
    fontSize: 15,
    fontWeight: '600',
    color: color('secondaryLabel', '#6C6C70'),
  },
  separator: {
    // Row padding + logo + gap, so the line starts under the text.
    marginLeft: 20 + INSTRUMENT_LOGO_SIZE + 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color('separator', '#C6C6C8'),
  },
  message: {
    paddingHorizontal: 32,
    paddingTop: 48,
    textAlign: 'center',
    fontSize: 15,
    color: color('secondaryLabel', '#6C6C70'),
  },
  loader: {
    marginTop: 24,
  },
});
