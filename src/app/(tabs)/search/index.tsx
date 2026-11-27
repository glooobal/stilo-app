import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { InstrumentRow } from '@/components/instrument-row';
import { Separator } from '@/components/separator';
import { TabScreen } from '@/components/tab-screen';
import { Colors } from '@/constants/colors';
import { getRecentInstruments, searchSavedInstruments } from '@/db/instruments';
import { useDataVersion } from '@/db/events';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { formatDecimalInput } from '@/lib/number';
import { withRecentView } from '@/lib/recent-views';
import { getRecentViews, saveRecentViews } from '@/lib/recent-views-store';
import type { InstrumentSearchResult } from '@/market/types';
import { MIN_QUERY_LENGTH, useInstrumentSearch } from '@/market/use-instrument-search';

type Row = { instrument: InstrumentSearchResult; detail?: string; isHeld?: boolean };

/**
 * Instruments recently used in transactions. The data version is an
 * argument so the list is read again after a transaction (the React
 * Compiler caches calls whose arguments do not change).
 */
function readRecentInstruments(_dataVersion: number) {
  return getRecentInstruments();
}

function pushInstrument(instrument: InstrumentSearchResult) {
  router.push({
    pathname: '/search/[symbol]',
    params: {
      symbol: instrument.symbol,
      name: instrument.name,
      exchange: instrument.exchange,
      exchangeName: instrument.exchangeName,
      type: instrument.type,
    },
  });
}

/** Search for stocks and ETFs; without a query it shows held and recent instruments. */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const dataVersion = useDataVersion();
  const { openPositions } = usePortfolioData();
  const heldQuantities = useMemo(
    () => new Map(openPositions.map((position) => [position.instrument.symbol, position.quantity])),
    [openPositions]
  );

  // Instruments opened from here, newest first (kept between launches).
  const [recentViews, setRecentViews] = useState(getRecentViews);
  const openInstrument = (instrument: InstrumentSearchResult) => {
    const next = withRecentView(recentViews, instrument);
    setRecentViews(next);
    saveRecentViews(next);
    pushInstrument(instrument);
  };
  const clearRecentViews = () => {
    setRecentViews([]);
    saveRecentViews([]);
  };

  const held: Row[] = useMemo(
    () =>
      openPositions.map((position) => ({
        instrument: position.instrument,
        detail: `${formatDecimalInput(position.quantity)} szt.`,
      })),
    [openPositions]
  );
  const viewed: Row[] = useMemo(
    () =>
      recentViews.map((instrument) => ({
        instrument,
        isHeld: heldQuantities.has(instrument.symbol),
      })),
    [recentViews, heldQuantities]
  );
  const recent: Row[] = useMemo(() => {
    const shown = new Set([...heldQuantities.keys(), ...recentViews.map((item) => item.symbol)]);
    return readRecentInstruments(dataVersion)
      .filter((instrument) => !shown.has(instrument.symbol))
      .map((instrument) => ({ instrument }));
  }, [heldQuantities, recentViews, dataVersion]);

  const saved = useMemo(() => (trimmed ? searchSavedInstruments(trimmed) : []), [trimmed]);
  const remote = useInstrumentSearch(trimmed);
  const results: Row[] = useMemo(() => {
    const savedSymbols = new Set(saved.map((instrument) => instrument.symbol));
    return [
      ...saved,
      ...remote.results.filter((instrument) => !savedSymbols.has(instrument.symbol)),
    ].map((instrument) => {
      // Search results say which instruments are already in a portfolio.
      const quantity = heldQuantities.get(instrument.symbol);
      return {
        instrument,
        isHeld: quantity != null,
        detail: quantity != null ? `${formatDecimalInput(quantity)} szt.` : undefined,
      };
    });
  }, [saved, remote.results, heldQuantities]);

  const renderRows = (rows: Row[]) =>
    rows.map((row, index) => (
      <View key={row.instrument.symbol}>
        {index > 0 ? <Separator inset={68} /> : null}
        <InstrumentRow
          instrument={row.instrument}
          detail={row.detail}
          isHeld={row.isHeld}
          onPress={() => openInstrument(row.instrument)}
        />
      </View>
    ));

  const message = (() => {
    if (!trimmed) {
      return held.length || viewed.length || recent.length
        ? null
        : 'Wyszukaj spółkę lub ETF po nazwie albo symbolu.';
    }
    if (trimmed.length < MIN_QUERY_LENGTH) return 'Wpisz co najmniej 2 znaki.';
    if (results.length) return null;
    if (remote.isLoading) return null;
    return remote.error ?? 'Nic nie znaleziono.';
  })();

  return (
    <>
      <Stack.SearchBar
        placement="automatic"
        placeholder="Szukaj spółek i ETF-ów"
        autoCapitalize="none"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setQuery('')}
      />
      <TabScreen title="Szukaj" backgroundColor={Colors.groupedBackground}>
        <View style={styles.content}>
          {trimmed ? (
            results.length ? (
              <Card title="Wyniki">
                {renderRows(results)}
                <View style={styles.bottomSpace} />
              </Card>
            ) : null
          ) : (
            <>
              {held.length ? (
                <Card title="Twoje pozycje">
                  {renderRows(held)}
                  <View style={styles.bottomSpace} />
                </Card>
              ) : null}
              {viewed.length ? (
                <Card
                  title="Ostatnio oglądane"
                  accessory={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Wyczyść ostatnio oglądane"
                      hitSlop={8}
                      onPress={clearRecentViews}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <Text style={styles.clear}>Wyczyść</Text>
                    </Pressable>
                  }>
                  {renderRows(viewed)}
                  <View style={styles.bottomSpace} />
                </Card>
              ) : null}
              {recent.length ? (
                <Card title="Ostatnio wybierane">
                  {renderRows(recent)}
                  <View style={styles.bottomSpace} />
                </Card>
              ) : null}
            </>
          )}
          {trimmed && remote.isLoading ? <ActivityIndicator style={styles.loader} /> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </TabScreen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  bottomSpace: {
    height: 6,
  },
  clear: {
    fontSize: 15,
    color: Colors.tint,
  },
  pressed: {
    opacity: 0.5,
  },
  loader: {
    marginTop: 8,
  },
  message: {
    paddingHorizontal: 32,
    paddingTop: 32,
    textAlign: 'center',
    fontSize: 15,
    color: Colors.secondaryLabel,
  },
});
