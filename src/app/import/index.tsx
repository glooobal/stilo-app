import { FieldGroup, Host, ListItem, Picker, Row, Spacer, Text } from '@expo/ui';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { InstrumentLogo } from '@/components/instrument-logo';
import { Colors } from '@/constants/colors';
import { restoreBackup } from '@/db/backup';
import { SCHEMA_VERSION } from '@/db/database';
import { addCashOperations } from '@/db/cash';
import { addDividends } from '@/db/dividends';
import { saveInstrument } from '@/db/instruments';
import { addTransactions } from '@/db/transactions';
import { usePortfolios } from '@/hooks/use-portfolio';
import { BackupError, countActive, parseBackup, type Backup } from '@/lib/backup';
import { BROKERS } from '@/lib/import/brokers';
import { prepareImport, type ImportPlan } from '@/lib/import/prepare';
import type { Broker, ImportFile } from '@/lib/import/types';
import { readPreference, writePreference } from '@/lib/preferences';
import { formatUpdatedAt } from '@/lib/quotes-status';
import { SpreadsheetError } from '@/lib/xlsx';

/** Shared with the transaction form: the portfolio used last. */
const LAST_PORTFOLIO_PREFERENCE = 'transactions.lastPortfolio';

const ERROR_COLOR = '#FF3B30';
const WARNING_COLOR = '#FF9500';
const TINT_COLOR = '#007AFF';
const BACKUP_SOURCE = 'backup';
const LOGO_SIZE = 32;

type Source = { id: string; name: string; broker: Broker | null };

const SOURCES: Source[] = [
  ...BROKERS.map((broker) => ({ id: broker.id, name: broker.name, broker })),
  { id: BACKUP_SOURCE, name: 'Kopia zapasowa Stilo', broker: null },
];

type PickedBrokerFile = { kind: 'broker'; name: string; file: ImportFile };
type PickedBackup = { kind: 'backup'; name: string; backup: Backup };

/**
 * Sheet: import transactions from a broker's export file into a portfolio,
 * or restore a backup of the app.
 */
export default function ImportScreen() {
  const params = useLocalSearchParams<{ portfolioId?: string }>();
  const portfolios = usePortfolios();

  // Without portfolios there is nothing to import a broker file into yet;
  // restoring a backup is the likely intent (e.g. a new phone).
  const [sourceId, setSourceId] = useState(
    portfolios.length === 0 ? BACKUP_SOURCE : SOURCES[0].id
  );
  const source = SOURCES.find((item) => item.id === sourceId) ?? SOURCES[0];
  const broker = source.broker;
  const [portfolioId, setPortfolioId] = useState<string | null>(() => {
    const ids = portfolios.map((item) => item.id);
    if (params.portfolioId && ids.includes(params.portfolioId)) return params.portfolioId;
    return readPreference(LAST_PORTFOLIO_PREFERENCE, ids, '') || (ids[0] ?? null);
  });
  // Falls back to the first one, e.g. right after adding a portfolio from here.
  const portfolio = portfolios.find((item) => item.id === portfolioId) ?? portfolios[0] ?? null;

  const [picked, setPicked] = useState<PickedBrokerFile | PickedBackup | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  /** Possible duplicates are left out unless the user chooses to add them. */
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const chooseSource = (id: string) => {
    if (id === sourceId) return;
    setSourceId(id);
    setPicked(null);
    setFileError(null);
  };

  // Checks a broker file against the chosen portfolio (duplicates, instruments).
  useEffect(() => {
    setPlan(null);
    setPrepareError(null);
    setIncludeDuplicates(false);
    if (picked?.kind !== 'broker' || !portfolio || !broker) return;
    const controller = new AbortController();
    setIsPreparing(true);
    prepareImport(picked.file, broker, portfolio, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPlan(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPrepareError('Nie udało się sprawdzić instrumentów. Sprawdź połączenie z internetem.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPreparing(false);
      });
    return () => controller.abort();
  }, [picked, portfolio, broker]);

  const pickFile = async () => {
    setFileError(null);
    try {
      const result = await File.pickFileAsync({
        mimeTypes: broker ? broker.mimeTypes : ['application/json', 'public.json'],
      });
      if (result.canceled) return;
      const name = result.result.name;
      if (broker) {
        const file = broker.parse(await result.result.bytes(), name);
        if (file.trades.length === 0) {
          setPicked(null);
          setFileError('W tym pliku nie ma transakcji akcji ani ETF.');
          return;
        }
        setPicked({ kind: 'broker', name, file });
      } else {
        const backup = parseBackup(await result.result.text(), SCHEMA_VERSION);
        setPicked({ kind: 'backup', name, backup });
      }
    } catch (error) {
      setPicked(null);
      setFileError(
        error instanceof SpreadsheetError || error instanceof BackupError
          ? error.message
          : 'Nie udało się odczytać pliku.'
      );
    }
  };

  const toImport = plan
    ? includeDuplicates
      ? [...plan.transactions, ...plan.possibleDuplicates]
      : plan.transactions
    : [];
  const oversoldSymbol = plan
    ? includeDuplicates
      ? plan.oversoldWithDuplicates
      : plan.oversoldSymbol
    : null;
  const dividendsToImport = plan?.dividends ?? [];
  const cashToImport = plan?.cashOperations ?? [];
  const canImport =
    picked?.kind === 'backup'
      ? picked.backup.portfolios.length > 0
      : plan != null &&
        portfolio != null &&
        toImport.length + dividendsToImport.length + cashToImport.length > 0 &&
        !oversoldSymbol;

  const close = () => router.back();

  const runImport = () => {
    if (!canImport || !picked) return;
    try {
      if (picked.kind === 'backup') {
        const { added, updated } = restoreBackup(picked.backup);
        close();
        Alert.alert(
          'Przywrócono kopię zapasową',
          added + updated === 0
            ? 'Wszystkie dane z kopii są już w aplikacji.'
            : `Dodano ${added}, zaktualizowano ${updated} ${recordsLabel(added + updated)}.`
        );
        return;
      }
      if (!plan || !portfolio) return;
      for (const instrument of plan.instruments) saveInstrument(instrument);
      addTransactions(toImport);
      addDividends(dividendsToImport);
      addCashOperations(cashToImport);
      writePreference(LAST_PORTFOLIO_PREFERENCE, portfolio.id);
      close();
      const dividendNote =
        dividendsToImport.length > 0
          ? ` i ${dividendsToImport.length} ${dividendsLabel(dividendsToImport.length)}`
          : '';
      Alert.alert(
        'Zaimportowano',
        `Dodano ${toImport.length} ${operationsLabel(toImport.length)}${dividendNote} do portfela „${portfolio.name}”.`
      );
    } catch (error) {
      Alert.alert(
        'Nie udało się zaimportować',
        `Nic nie zostało zapisane. ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const summary = useMemo((): [string, string][] | null => {
    if (picked?.kind === 'backup') {
      const { backup } = picked;
      const created = Date.parse(backup.createdAt);
      return [
        ['Portfele', String(countActive(backup.portfolios))],
        ['Operacje', String(countActive(backup.transactions))],
        ['Dywidendy', String(countActive(backup.dividends))],
        ['Data kopii', Number.isNaN(created) ? '—' : formatUpdatedAt(created)],
      ];
    }
    if (!plan) return null;
    const rows: [string, string][] = [
      ['Kupno', String(plan.buyCount)],
      ['Sprzedaż', String(plan.sellCount)],
      ['Instrumenty', String(new Set(plan.transactions.map((t) => t.symbol)).size)],
      ['Dywidendy', String(plan.dividends.length)],
    ];
    if (plan.cashOperations.length > 0) {
      rows.push(['Wpłaty, wypłaty i odsetki', String(plan.cashOperations.length)]);
    }
    const earlier = plan.duplicateCount + plan.duplicateDividendCount;
    if (earlier > 0) rows.push(['Zaimportowane wcześniej', String(earlier)]);
    return rows;
  }, [plan, picked]);
  const duplicateCount = plan?.possibleDuplicates.length ?? 0;

  const warnings =
    plan && picked?.kind === 'broker'
      ? [
          plan.skippedTickers.length > 0
            ? `Pominięte (nieobsługiwany rynek lub brak notowań): ${plan.skippedTickers.join(', ')}.`
            : null,
          plan.cashSkipReason === 'not-cash'
            ? 'Wpłaty i wypłaty z pliku zostaną pominięte: ten portfel nie śledzi gotówki.'
            : plan.cashSkipReason === 'currency'
              ? 'Wpłaty i wypłaty z pliku zostaną pominięte: portfel jest w innej walucie niż konto.'
              : null,
          plan.isCurrencyMismatch
            ? `Konto ${broker?.name} jest w ${plan.accountCurrency}, a portfel w ${portfolio?.baseCurrency}. Walutowe transakcje zostaną przeliczone po kursach rynkowych.`
            : null,
          toImport.length + dividendsToImport.length + cashToImport.length === 0 &&
          plan.duplicateCount + plan.duplicateDividendCount + duplicateCount > 0
            ? 'Wszystkie transakcje z tego pliku są już w portfelu.'
            : null,
        ].filter((text): text is string => text != null)
      : [];

  const footer = (() => {
    if (picked?.kind === 'backup') {
      return {
        text: 'Portfele i operacje z kopii zostaną dodane do obecnych. Nic nie zostanie usunięte, a operacje zmienione później na tym telefonie zostaną zachowane.',
      };
    }
    if (oversoldSymbol) {
      return {
        color: ERROR_COLOR,
        text: `Sprzedaż ${oversoldSymbol} przekroczyłaby stan posiadania. Wyeksportuj historię za cały okres.`,
      };
    }
    if (duplicateCount > 0 && warnings.length === 0) {
      return {
        text: `${duplicateCount} ${operationsLabel(duplicateCount, 'nominative')} z pliku ma już odpowiednik w portfelu (ten sam walor, dzień, ilość i cena), np. dodany ręcznie. „Pomiń” je pominie, „Dodaj” zaimportuje mimo to.`,
      };
    }
    if (warnings.length > 0) return { color: WARNING_COLOR, text: warnings.join('\n') };
    if (plan) {
      return {
        text: 'Kursy walut i prowizje z pliku zostaną zapisane z transakcjami. Dywidendy z pliku zastąpią te wyliczone przez aplikację. Wpłaty i odsetki nie są jeszcze importowane.',
      };
    }
    return null;
  })();

  return (
    <>
      <Stack.Title>Import z pliku</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={close}>
          Anuluj
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel={picked?.kind === 'backup' ? 'Przywróć kopię' : 'Importuj transakcje'}
          disabled={!canImport}
          onPress={runImport}>
          {picked?.kind === 'backup' ? 'Przywróć' : 'Importuj'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={styles.host}>
        <FieldGroup>
          <FieldGroup.Section title="Źródło">
            {SOURCES.map((item) => (
              <ListItem
                key={item.id}
                onPress={() => chooseSource(item.id)}
                leading={<SourceIcon source={item} />}
                trailing={
                  item.id === sourceId ? (
                    <SymbolView name="checkmark" tintColor={Colors.tint} size={17} />
                  ) : undefined
                }>
                {item.name}
              </ListItem>
            ))}
          </FieldGroup.Section>

          {broker && portfolios.length === 0 ? (
            <FieldGroup.Section title="Portfel">
              <ListItem onPress={() => router.push('/portfolio/form')}>
                <Text textStyle={{ color: TINT_COLOR }}>Dodaj portfel</Text>
              </ListItem>
              <FieldGroup.SectionFooter>
                <Text>Transakcje importujesz do portfela. Najpierw go dodaj.</Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          ) : broker ? (
            <FieldGroup.Section title="Portfel">
              <Row alignment="center" spacing={12}>
                <Text>Importuj do</Text>
                <Spacer flexible />
                <Picker
                  selectedValue={portfolio?.id ?? ''}
                  onValueChange={(id) => setPortfolioId(id || null)}
                  appearance="menu"
                  accessibilityLabel="Portfel">
                  {portfolios.map((item) => (
                    <Picker.Item key={item.id} label={item.name} value={item.id} />
                  ))}
                </Picker>
              </Row>
            </FieldGroup.Section>
          ) : null}

          {broker && portfolios.length === 0 ? null : (
            <FieldGroup.Section title="Plik">
              <ListItem onPress={pickFile} supportingText={picked?.name}>
                {picked ? 'Wybierz inny plik' : 'Wybierz plik…'}
              </ListItem>
              <FieldGroup.SectionFooter>
                {fileError ? (
                  <Text textStyle={{ color: ERROR_COLOR }}>{fileError}</Text>
                ) : (
                  <Text>
                    {broker
                      ? broker.exportHint
                      : 'Wybierz plik kopii zapisany w Ustawieniach (stilo-kopia-….json).'}
                  </Text>
                )}
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          )}

          {picked ? (
            <FieldGroup.Section title="Podgląd">
              {isPreparing ? <ListItem>Sprawdzanie instrumentów…</ListItem> : null}
              {prepareError ? (
                <ListItem>
                  <Text textStyle={{ color: ERROR_COLOR }}>{prepareError}</Text>
                </ListItem>
              ) : null}
              {summary?.map(([label, value]) => (
                <ListItem key={label} trailing={value}>
                  {label}
                </ListItem>
              ))}
              {duplicateCount > 0 ? (
                <Row alignment="center" spacing={12}>
                  <Text>{`Możliwe duplikaty: ${duplicateCount}`}</Text>
                  <Spacer flexible />
                  <Picker
                    selectedValue={includeDuplicates ? 'add' : 'skip'}
                    onValueChange={(value) => setIncludeDuplicates(value === 'add')}
                    appearance="menu"
                    accessibilityLabel="Co zrobić z duplikatami">
                    <Picker.Item label="Pomiń" value="skip" />
                    <Picker.Item label="Dodaj" value="add" />
                  </Picker>
                </Row>
              ) : null}
              {footer ? (
                <FieldGroup.SectionFooter>
                  <Text textStyle={footer.color ? { color: footer.color } : undefined}>
                    {footer.text}
                  </Text>
                </FieldGroup.SectionFooter>
              ) : null}
            </FieldGroup.Section>
          ) : null}
        </FieldGroup>
      </Host>
    </>
  );
}

/** Broker logo (Brandfetch, by its website), or an icon for the app backup. */
function SourceIcon({ source }: { source: Source }) {
  if (source.broker) {
    return (
      <InstrumentLogo
        symbol={source.broker.id}
        name={source.broker.name}
        domain={source.broker.domain}
        size={LOGO_SIZE}
      />
    );
  }
  return (
    <View style={styles.backupIcon}>
      <SymbolView name="externaldrive.fill" tintColor="#FFFFFF" size={17} />
    </View>
  );
}

function operationsLabel(count: number, form: 'accusative' | 'nominative' = 'accusative'): string {
  if (count === 1) return form === 'accusative' ? 'operację' : 'operacja';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'operacje';
  return 'operacji';
}

function dividendsLabel(count: number): string {
  if (count === 1) return 'dywidendę';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'dywidendy';
  return 'dywidend';
}

function recordsLabel(count: number): string {
  if (count === 1) return 'pozycję';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'pozycje';
  return 'pozycji';
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  backupIcon: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: Colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
