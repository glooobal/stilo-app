import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { InstrumentRow } from '@/components/instrument-row';
import { Separator } from '@/components/separator';
import { TabScreen } from '@/components/tab-screen';
import { Colors } from '@/constants/colors';
import { getRecentInstruments, searchSavedInstruments } from '@/db/instruments';
import { useDataVersion } from '@/db/events';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { formatDecimalInput } from '@/lib/number';
import type { InstrumentSearchResult } from '@/market/types';
import { MIN_QUERY_LENGTH, useInstrumentSearch } from '@/market/use-instrument-search';

type Row = { instrument: InstrumentSearchResult; detail?: string };

function openInstrument(instrument: InstrumentSearchResult) {
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

  const held: Row[] = useMemo(
    () =>
      openPositions.map((position) => ({
        instrument: position.instrument,
        detail: `${formatDecimalInput(position.quantity)} szt.`,
      })),
    [openPositions]
  );
  const recent: Row[] = useMemo(() => {
    const heldSymbols = new Set(openPositions.map((position) => position.instrument.symbol));
    return getRecentInstruments()
      .filter((instrument) => !heldSymbols.has(instrument.symbol))
      .map((instrument) => ({ instrument }));
    // `dataVersion` refreshes the list after a transaction saves an instrument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPositions, dataVersion]);

  const saved = useMemo(() => (trimmed ? searchSavedInstruments(trimmed) : []), [trimmed]);
  const remote = useInstrumentSearch(trimmed);
  const results: Row[] = useMemo(() => {
    const savedSymbols = new Set(saved.map((instrument) => instrument.symbol));
    return [
      ...saved,
      ...remote.results.filter((instrument) => !savedSymbols.has(instrument.symbol)),
    ].map((instrument) => ({ instrument }));
  }, [saved, remote.results]);

  const renderRows = (rows: Row[]) =>
    rows.map((row, index) => (
      <View key={row.instrument.symbol}>
        {index > 0 ? <Separator inset={68} /> : null}
        <InstrumentRow
          instrument={row.instrument}
          detail={row.detail}
          onPress={() => openInstrument(row.instrument)}
        />
      </View>
    ));

  const message = (() => {
    if (!trimmed) {
      return held.length || recent.length ? null : 'Wyszukaj spółkę lub ETF po nazwie albo symbolu.';
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
