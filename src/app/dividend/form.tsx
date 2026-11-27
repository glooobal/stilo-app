import {
  FieldGroup,
  Host,
  ListItem,
  Picker,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';
import { scrollDismissesKeyboard } from '@expo/ui/swift-ui/modifiers';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';

import { DateField } from '@/components/date-field';
import { InstrumentLogo } from '@/components/instrument-logo';
import { addDividend, deleteDividend, getDividend, updateDividend } from '@/db/dividends';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { formatDisplayDate, fromISODate, toISODate, todayISODate } from '@/lib/date';
import { defaultDividendTaxRate } from '@/lib/dividend-tax';
import { formatDecimalInput, formatMoney, formatPercent, parseDecimal } from '@/lib/number';
import { marketData } from '@/market';
import { fxSymbol } from '@/market/history';

const ERROR_COLOR = '#FF3B30';

const FORM_MODIFIERS =
  Platform.OS === 'ios' ? [scrollDismissesKeyboard('interactively')] : undefined;

type FormParams = {
  /** Set when editing. */
  dividendId?: string;
  symbol?: string;
  portfolioId?: string;
};

/**
 * Sheet for a dividend: add one by hand, or correct / delete one (also one
 * worked out by the app, which is then no longer updated automatically).
 */
export default function DividendFormScreen() {
  const params = useLocalSearchParams<FormParams>();
  const existing = useMemo(
    () => (params.dividendId ? getDividend(params.dividendId) : null),
    [params.dividendId]
  );
  if (params.dividendId && !existing) {
    return (
      <>
        <Stack.Title>Dywidenda</Stack.Title>
        <Host style={styles.host}>
          <FieldGroup>
            <FieldGroup.Section>
              <ListItem>Ta dywidenda została usunięta.</ListItem>
            </FieldGroup.Section>
          </FieldGroup>
        </Host>
      </>
    );
  }
  return (
    <DividendForm
      key={existing?.id ?? 'new'}
      existing={existing}
      initialSymbol={params.symbol}
      initialPortfolioId={params.portfolioId}
    />
  );
}

function DividendForm({
  existing,
  initialSymbol,
  initialPortfolioId,
}: {
  existing: ReturnType<typeof getDividend>;
  initialSymbol?: string;
  initialPortfolioId?: string;
}) {
  const { portfolios, positions } = usePortfolioData();
  // Instruments the user holds or held: dividends belong to one of them.
  const instruments = useMemo(
    () =>
      positions
        .map((position) => position.instrument)
        .sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    [positions]
  );
  const [symbol, setSymbol] = useState<string | null>(
    existing?.symbol ?? initialSymbol ?? instruments[0]?.symbol ?? null
  );
  const instrument = instruments.find((item) => item.symbol === symbol) ?? existing?.instrument;

  const [portfolioId, setPortfolioId] = useState<string | null>(() => {
    if (existing) return existing.portfolioId;
    const ids = portfolios.map((item) => item.id);
    if (initialPortfolioId && ids.includes(initialPortfolioId)) return initialPortfolioId;
    // A portfolio that holds the instrument.
    const holding = positions
      .find((position) => position.instrument.symbol === symbol)
      ?.transactions.at(-1)?.portfolioId;
    return holding ?? ids[0] ?? null;
  });
  const portfolio = portfolios.find((item) => item.id === portfolioId) ?? null;
  const portfolioCurrency = portfolio?.baseCurrency ?? null;
  const instrumentCurrency = instrument?.currency ?? null;

  // Brokers often credit foreign dividends in the account currency.
  const [inPortfolioCurrency, setInPortfolioCurrency] = useState(
    existing ? existing.currency !== existing.instrument.currency : false
  );
  const currency =
    inPortfolioCurrency && portfolioCurrency ? portfolioCurrency : instrumentCurrency;
  const needsRate = currency != null && portfolioCurrency != null && currency !== portfolioCurrency;

  const taxRate =
    symbol && portfolio ? defaultDividendTaxRate(symbol, portfolio.accountType) : 0;

  const initialGross = existing ? formatDecimalInput(existing.gross) : '';
  const initialTax = existing ? formatDecimalInput(existing.tax) : '';
  const initialRate =
    existing?.fxRate != null && existing.fxCurrency === portfolioCurrency
      ? formatDecimalInput(existing.fxRate)
      : '';
  const grossState = useNativeState(initialGross);
  const taxState = useNativeState(initialTax);
  const rateState = useNativeState(initialRate);
  const [grossText, setGrossText] = useState(initialGross);
  const [taxText, setTaxText] = useState(initialTax);
  const [rateText, setRateText] = useState(initialRate);
  const [date, setDate] = useState(() =>
    existing ? fromISODate(existing.paidAt) : new Date()
  );
  /** The tax follows the gross amount until the user types it. */
  const isTaxEditedRef = useRef(existing != null);
  const isRateEditedRef = useRef(initialRate !== '');

  const gross = parseDecimal(grossText);
  const tax = taxText.trim() === '' ? 0 : parseDecimal(taxText);
  const rate = needsRate ? parseDecimal(rateText) : 1;

  // Prefill the tax with the usual rate (19% in Poland, at source abroad).
  useEffect(() => {
    if (isTaxEditedRef.current) return;
    const text = gross != null && gross > 0 ? formatDecimalInput(gross * taxRate) : '';
    taxState.value = text;
    setTaxText(text);
  }, [gross, taxRate, taxState]);

  // The market rate of the day, when the dividend is in another currency.
  useEffect(() => {
    if (!needsRate || !currency || !portfolioCurrency || isRateEditedRef.current) return;
    const controller = new AbortController();
    const isoDate = toISODate(date);
    marketData
      .getQuote(
        fxSymbol(currency, portfolioCurrency),
        isoDate === todayISODate() ? undefined : isoDate,
        controller.signal
      )
      .then((quote) => {
        if (isRateEditedRef.current) return;
        const text = formatDecimalInput(quote.price);
        rateState.value = text;
        setRateText(text);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [needsRate, currency, portfolioCurrency, date, rateState]);

  const validationError = (() => {
    if (grossText && (gross == null || gross <= 0)) return 'Podaj poprawną kwotę brutto.';
    if (tax == null || tax < 0) return 'Podaj poprawny podatek.';
    if (gross != null && tax != null && tax > gross) return 'Podatek nie może być wyższy niż kwota brutto.';
    if (needsRate && rateText && (rate == null || rate <= 0)) return 'Podaj poprawny kurs.';
    return null;
  })();
  const canSave =
    symbol != null &&
    portfolioId != null &&
    currency != null &&
    gross != null &&
    gross > 0 &&
    tax != null &&
    rate != null &&
    rate > 0 &&
    validationError == null;
  const net = gross != null && tax != null ? gross - tax : null;

  const close = () => router.back();

  const save = () => {
    if (!canSave || !symbol || !portfolioId || !currency || gross == null || tax == null) return;
    const values = {
      portfolioId,
      paidAt: toISODate(date),
      gross,
      tax,
      currency,
      fxRate: needsRate ? rate : null,
      fxCurrency: needsRate ? portfolioCurrency : null,
    };
    if (existing) {
      updateDividend(existing.id, values);
    } else {
      addDividend({
        ...values,
        symbol,
        exDate: null,
        quantity: null,
        perShare: null,
        source: 'manual',
        externalId: null,
      });
    }
    close();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Usunąć dywidendę?',
      existing.source === 'auto'
        ? 'Aplikacja nie wyliczy jej ponownie.'
        : 'Tej operacji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: () => {
            deleteDividend(existing.id);
            close();
          },
        },
      ]
    );
  };

  const taxFooter =
    taxRate > 0
      ? `Podatek pobrany przy wypłacie. Domyślnie ${formatPercent(taxRate, false)}${
          portfolio?.accountType !== 'standard' ? ' (podatek u źródła, także na IKE/IKZE)' : ''
        } – zmień go, jeśli był inny.`
      : 'Podatek pobrany przy wypłacie (na IKE/IKZE od polskich spółek: 0).';
  const autoNote =
    existing?.source === 'auto' && existing.quantity != null && existing.perShare != null
      ? `Dodana automatycznie: ${formatDecimalInput(existing.quantity)} szt. × ${formatDecimalInput(existing.perShare)} ${existing.currency}${existing.exDate ? `, dzień odcięcia ${formatDisplayDate(existing.exDate)}` : ''}. Dane rynkowe nie podają daty wypłaty, więc jest szacowana – popraw ją, jeśli znasz dokładną. Po zmianie aplikacja nie będzie już aktualizować tej dywidendy.`
      : null;

  return (
    <>
      <Stack.Title>{existing ? 'Dywidenda' : 'Nowa dywidenda'}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={close}>
          Anuluj
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel="Zapisz dywidendę"
          disabled={!canSave}
          onPress={save}>
          Zapisz
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={styles.host}>
        <FieldGroup modifiers={FORM_MODIFIERS}>
          <FieldGroup.Section title="Walor">
            {existing || instruments.length === 0 ? (
              <ListItem
                leading={
                  instrument ? (
                    <InstrumentLogo symbol={instrument.symbol} name={instrument.name} size={40} />
                  ) : undefined
                }
                supportingText={instrument?.symbol}>
                {instrument?.name ?? 'Najpierw dodaj zakup waloru.'}
              </ListItem>
            ) : (
              <Row alignment="center" spacing={12}>
                <Text>Walor</Text>
                <Spacer flexible />
                <Picker
                  selectedValue={symbol ?? ''}
                  onValueChange={(value) => setSymbol(value || null)}
                  appearance="menu"
                  accessibilityLabel="Walor">
                  {instruments.map((item) => (
                    <Picker.Item key={item.symbol} label={item.name} value={item.symbol} />
                  ))}
                </Picker>
              </Row>
            )}
            {autoNote ? (
              <FieldGroup.SectionFooter>
                <Text>{autoNote}</Text>
              </FieldGroup.SectionFooter>
            ) : null}
          </FieldGroup.Section>

          <FieldGroup.Section title="Wypłata">
            <Row alignment="center" spacing={12}>
              <Text>Portfel</Text>
              <Spacer flexible />
              <Picker
                selectedValue={portfolioId ?? ''}
                onValueChange={(id) => setPortfolioId(id || null)}
                appearance="menu"
                accessibilityLabel="Portfel">
                {portfolios.map((item) => (
                  <Picker.Item key={item.id} label={item.name} value={item.id} />
                ))}
              </Picker>
            </Row>
            <DateField label="Data wypłaty" value={date} maximumDate={new Date()} onChange={setDate} />
            <Row alignment="center" spacing={12}>
              <Text>Kwota brutto</Text>
              <TextInput
                value={grossState}
                onChangeText={setGrossText}
                placeholder="0,00"
                keyboardType="decimal-pad"
                textAlign="right"
                accessibilityLabel={`Kwota brutto w ${currency ?? ''}`}
              />
              {instrumentCurrency && portfolioCurrency && instrumentCurrency !== portfolioCurrency ? (
                <Picker
                  selectedValue={inPortfolioCurrency ? 'portfolio' : 'instrument'}
                  onValueChange={(value) => setInPortfolioCurrency(value === 'portfolio')}
                  appearance="menu"
                  accessibilityLabel="Waluta wypłaty">
                  <Picker.Item label={instrumentCurrency} value="instrument" />
                  <Picker.Item label={portfolioCurrency} value="portfolio" />
                </Picker>
              ) : (
                <Text>{currency ?? ''}</Text>
              )}
            </Row>
            <Row alignment="center" spacing={12}>
              <Text>Podatek</Text>
              <TextInput
                value={taxState}
                onChangeText={(text) => {
                  isTaxEditedRef.current = true;
                  setTaxText(text);
                }}
                placeholder="0,00"
                keyboardType="decimal-pad"
                textAlign="right"
                accessibilityLabel="Podatek pobrany"
              />
              <Text>{currency ?? ''}</Text>
            </Row>
            {needsRate ? (
              <Row alignment="center" spacing={12}>
                <Text>{`Kurs ${currency}/${portfolioCurrency}`}</Text>
                <TextInput
                  value={rateState}
                  onChangeText={(text) => {
                    isRateEditedRef.current = true;
                    setRateText(text);
                  }}
                  placeholder="0,0000"
                  keyboardType="decimal-pad"
                  textAlign="right"
                  accessibilityLabel={`Kurs wymiany ${currency} na ${portfolioCurrency}`}
                />
              </Row>
            ) : null}
            <FieldGroup.SectionFooter>
              {validationError ? (
                <Text textStyle={{ color: ERROR_COLOR }}>{validationError}</Text>
              ) : (
                <Text>{taxFooter}</Text>
              )}
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Podsumowanie">
            <ListItem trailing={net != null && currency ? formatMoney(net, currency) : '—'}>
              Netto
            </ListItem>
            {needsRate && portfolioCurrency ? (
              <ListItem
                trailing={
                  net != null && rate != null ? formatMoney(net * rate, portfolioCurrency) : '—'
                }>
                {`Netto w walucie portfela (${portfolioCurrency})`}
              </ListItem>
            ) : null}
          </FieldGroup.Section>

          {existing ? (
            <FieldGroup.Section>
              <ListItem onPress={confirmDelete}>
                <Text textStyle={{ color: ERROR_COLOR }}>Usuń dywidendę</Text>
              </ListItem>
            </FieldGroup.Section>
          ) : null}
        </FieldGroup>
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
