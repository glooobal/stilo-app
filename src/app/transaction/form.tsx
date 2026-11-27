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
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';

import { DateField } from '@/components/date-field';
import { InstrumentLogo } from '@/components/instrument-logo';
import { getSavedInstrument, saveInstrument } from '@/db/instruments';
import { getSplits } from '@/db/splits';
import {
  addTransaction,
  deleteTransaction,
  findSimilarTransaction,
  getTransaction,
  updateTransaction,
  type TransactionSide,
} from '@/db/transactions';
import { usePortfolioData } from '@/hooks/use-portfolio';
import { formatDisplayDate, fromISODate, toISODate, todayISODate } from '@/lib/date';
import { estimateCashBalance } from '@/lib/cash';
import { calculateSaleProfit, findOversell, type Trade } from '@/lib/fifo';
import { convertTrade, isImplausibleRate, tradeRate } from '@/lib/fx';
import { formatDecimalInput, formatMoney, formatProfit, parseDecimal } from '@/lib/number';
import { quantityOn } from '@/lib/positions';
import {
  adjustForSplits,
  formatSplitRatio,
  isUnsplit,
  quantityBeforeSplits,
  splitRatio,
} from '@/lib/splits';
import { readPreference, writePreference } from '@/lib/preferences';
import { marketData, MarketDataError, type Instrument, type InstrumentType } from '@/market';
import { fxSymbol } from '@/market/history';

type FormParams = {
  /** Set when editing an existing transaction. */
  transactionId?: string;
  side?: string;
  symbol?: string;
  name?: string;
  exchange?: string;
  exchangeName?: string;
  type?: string;
  /** Portfolio to add the transaction to (when opened from a portfolio). */
  portfolioId?: string;
};

/** The portfolio used last is preselected for the next transaction. */
const LAST_PORTFOLIO_PREFERENCE = 'transactions.lastPortfolio';

const ERROR_COLOR = '#FF3B30';
const PROFIT_COLOR = '#34C759';
const WARNING_COLOR = '#FF9500';

// The decimal keyboard has no return key, so scrolling the form hides it.
const FORM_MODIFIERS =
  Platform.OS === 'ios' ? [scrollDismissesKeyboard('interactively')] : undefined;

export default function TransactionFormScreen() {
  const params = useLocalSearchParams<FormParams>();
  const existing = useMemo(
    () => (params.transactionId ? getTransaction(params.transactionId) : null),
    [params.transactionId]
  );

  if (params.transactionId && !existing) {
    return (
      <>
        <Stack.Title>Transakcja</Stack.Title>
        <Host style={styles.host}>
          <FieldGroup>
            <FieldGroup.Section>
              <ListItem>Ta transakcja została usunięta.</ListItem>
            </FieldGroup.Section>
          </FieldGroup>
        </Host>
      </>
    );
  }

  const instrument: Instrument = existing?.instrument ?? {
    symbol: params.symbol ?? '',
    name: params.name ?? params.symbol ?? '',
    exchange: params.exchange ?? '',
    exchangeName: params.exchangeName ?? '',
    type: (params.type === 'ETF' ? 'ETF' : 'EQUITY') as InstrumentType,
    currency: getSavedInstrument(params.symbol ?? '')?.currency ?? '',
  };
  const side: TransactionSide = existing?.side ?? (params.side === 'sell' ? 'sell' : 'buy');

  return (
    <TransactionForm
      key={existing?.id ?? 'new'}
      instrument={instrument}
      side={side}
      existing={existing}
      initialPortfolioId={params.portfolioId}
    />
  );
}

type TransactionFormProps = {
  instrument: Instrument;
  side: TransactionSide;
  existing: ReturnType<typeof getTransaction>;
  initialPortfolioId?: string;
};

function TransactionForm({ instrument, side, existing, initialPortfolioId }: TransactionFormProps) {
  const navigation = useNavigation();
  const isEditing = existing != null;
  // The form can open as the first screen of the sheet (editing, or adding
  // from a position screen); then it needs its own close button.
  const isSheetRoot = navigation.getState()?.index === 0;
  const { portfolios, transactions, dividends, cashOperations } = usePortfolioData();

  const [portfolioId, setPortfolioId] = useState<string | null>(() => {
    const ids = portfolios.map((item) => item.id);
    if (existing) return existing.portfolioId;
    if (initialPortfolioId && ids.includes(initialPortfolioId)) return initialPortfolioId;
    if (side === 'sell') {
      // Selling: preselect a portfolio that holds the instrument.
      const today = todayISODate();
      const holding = ids.find(
        (id) =>
          quantityOn(
            transactions.filter((t) => t.portfolioId === id && t.symbol === instrument.symbol),
            today
          ) > 0
      );
      if (holding) return holding;
    }
    const last = readPreference(LAST_PORTFOLIO_PREFERENCE, ids, '');
    return last || (ids[0] ?? null);
  });

  /** Trades of this instrument in a portfolio, without the one being edited. */
  const tradesIn = (id: string | null) =>
    transactions.filter(
      (transaction) =>
        transaction.portfolioId === id &&
        transaction.symbol === instrument.symbol &&
        transaction.id !== existing?.id
    );

  /** Other trades of this instrument in the selected portfolio (FIFO is per portfolio). */
  const otherTrades = useMemo(
    () => tradesIn(portfolioId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, instrument.symbol, existing?.id, portfolioId]
  );

  /** Moving a purchase out of its portfolio must not leave later sales uncovered there. */
  const movedOutBlocker = useMemo(() => {
    if (!existing || existing.portfolioId === portfolioId) return null;
    return findOversell(tradesIn(existing.portfolioId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, portfolioId, transactions]);

  // The values as entered (before any split adjustment).
  const initialQuantity = existing ? formatDecimalInput(existing.enteredQuantity) : '';
  const initialPrice = existing ? formatDecimalInput(existing.enteredPrice) : '';
  const initialFee =
    existing && existing.enteredFee > 0 ? formatDecimalInput(existing.enteredFee) : '';
  const splits = useMemo(() => getSplits(instrument.symbol), [instrument.symbol]);

  const quantityState = useNativeState(initialQuantity);
  const priceState = useNativeState(initialPrice);
  const feeState = useNativeState(initialFee);
  const [quantityText, setQuantityText] = useState(initialQuantity);
  const [priceText, setPriceText] = useState(initialPrice);
  const [feeText, setFeeText] = useState(initialFee);
  const [date, setDate] = useState(() =>
    existing ? fromISODate(existing.tradedAt) : new Date()
  );

  const [currency, setCurrency] = useState<string | null>(
    existing?.currency || instrument.currency || null
  );
  const [isPriceLoading, setIsPriceLoading] = useState(!isEditing);
  const [priceError, setPriceError] = useState<string | null>(null);
  /** Once a price is typed (or comes from a saved transaction), it is never overwritten. */
  const isPriceEditedRef = useRef(isEditing);
  const isFirstDateRef = useRef(true);

  // Exchange rate, when the instrument is quoted in another currency than
  // the portfolio: the rate the broker converted at (prefilled with the
  // market rate of the day). It counts towards cost, profit and loss.
  const portfolioCurrency =
    portfolios.find((item) => item.id === portfolioId)?.baseCurrency ?? null;
  const needsRate = currency != null && portfolioCurrency != null && currency !== portfolioCurrency;
  const savedRate =
    existing && portfolioCurrency ? tradeRate(existing, portfolioCurrency) : null;
  const initialRate = savedRate != null && needsRate ? formatDecimalInput(savedRate) : '';
  const rateState = useNativeState(initialRate);
  const [rateText, setRateText] = useState(initialRate);
  const [isRateLoading, setIsRateLoading] = useState(false);
  /** Market rate of the trade's day, to warn about a rate that cannot be right. */
  const [marketRate, setMarketRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  /** A typed rate (or the one saved for this portfolio currency) is never overwritten. */
  const isRateEditedRef = useRef(savedRate != null);

  // A commission on a foreign instrument is often charged in the portfolio
  // currency (e.g. in PLN at XTB); it is saved in the currency it was paid in.
  const [feeInPortfolioCurrency, setFeeInPortfolioCurrency] = useState(() =>
    existing ? existing.feeCurrency != null && existing.feeCurrency !== existing.currency : true
  );
  const feeCurrency =
    needsRate && feeInPortfolioCurrency && portfolioCurrency ? portfolioCurrency : currency;

  useEffect(() => {
    // When editing, only fetch after the user changes the date.
    if (isEditing && isFirstDateRef.current) {
      isFirstDateRef.current = false;
      return;
    }
    const controller = new AbortController();
    const isoDate = toISODate(date);
    const requestedDate = isoDate === todayISODate() ? undefined : isoDate;

    setIsPriceLoading(true);
    setPriceError(null);
    marketData
      .getQuote(instrument.symbol, requestedDate, controller.signal)
      .then((quote) => {
        setCurrency(quote.currency);
        if (!isPriceEditedRef.current) {
          // Market data is adjusted for later splits; the form is in the
          // shares of its date, so the price goes back to that day's shares.
          const dayRatio = splitRatio(splits, isoDate);
          const dayPrice = isUnsplit(dayRatio)
            ? quote.price
            : (quote.price * dayRatio.numerator) / dayRatio.denominator;
          const text = formatDecimalInput(dayPrice);
          priceState.value = text;
          setPriceText(text);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPriceError(
          error instanceof MarketDataError ? error.message : 'Nie udało się pobrać ceny.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPriceLoading(false);
      });

    return () => controller.abort();
  }, [date, instrument.symbol, priceState, isEditing, splits]);

  useEffect(() => {
    if (!needsRate || !currency || !portfolioCurrency || isRateEditedRef.current) return;
    const controller = new AbortController();
    const isoDate = toISODate(date);
    setIsRateLoading(true);
    setRateError(null);
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
      .catch(() => {
        if (!controller.signal.aborted) setRateError('Nie udało się pobrać kursu. Wpisz go.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRateLoading(false);
      });
    return () => controller.abort();
  }, [needsRate, currency, portfolioCurrency, date, rateState]);

  useEffect(() => {
    setMarketRate(null);
    if (!needsRate || !currency || !portfolioCurrency) return;
    const controller = new AbortController();
    const isoDate = toISODate(date);
    marketData
      .getQuote(
        fxSymbol(currency, portfolioCurrency),
        isoDate === todayISODate() ? undefined : isoDate,
        controller.signal
      )
      .then((quote) => setMarketRate(quote.price))
      .catch(() => {
        // Without it there is simply no warning.
      });
    return () => controller.abort();
  }, [needsRate, currency, portfolioCurrency, date]);

  const tradedAt = toISODate(date);
  const rate = needsRate ? parseDecimal(rateText) : 1;
  const isRateImplausible =
    needsRate && rate != null && marketRate != null && isImplausibleRate(rate, marketRate);
  const quantity = parseDecimal(quantityText);
  const price = parseDecimal(priceText);
  const fee = feeText.trim() === '' ? 0 : parseDecimal(feeText);
  // Other trades are in today's shares; the form is in the shares of its date.
  const ratio = splitRatio(splits, tradedAt);
  const heldToday = useMemo(() => quantityOn(otherTrades, tradedAt), [otherTrades, tradedAt]);
  const heldOnDate = quantityBeforeSplits(heldToday, ratio);
  const isFeeInPortfolio = feeCurrency != null && feeCurrency !== currency;
  /** The fee in the instrument currency (for calculations in it). */
  const instrumentFee =
    fee != null && isFeeInPortfolio ? (rate ? fee / rate : null) : fee;
  /** The fee in the portfolio currency (exact when paid in it). */
  const portfolioFee = fee != null ? (isFeeInPortfolio ? fee : rate != null ? fee * rate : null) : null;

  const candidate: Trade | null =
    quantity != null && quantity > 0 && price != null && instrumentFee != null
      ? { side, ...adjustForSplits(quantity, price, ratio), fee: instrumentFee, tradedAt }
      : null;

  const oversell = useMemo(
    () => (candidate ? findOversell<Trade>([...otherTrades, candidate]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [otherTrades, side, quantity, price, instrumentFee, tradedAt, ratio.numerator, ratio.denominator]
  );

  const validationError = (() => {
    if (quantityText && (quantity == null || quantity <= 0)) return 'Podaj poprawną ilość.';
    if (priceText && (price == null || price <= 0)) return 'Podaj poprawną cenę.';
    if (fee == null || fee < 0) return 'Podaj poprawną prowizję.';
    if (needsRate && rateText && (rate == null || rate <= 0)) return 'Podaj poprawny kurs.';
    if (oversell && oversell === candidate) {
      return `${formatDisplayDate(tradedAt)} masz tylko ${formatDecimalInput(heldOnDate)} szt.`;
    }
    if (oversell) {
      return `Po tej zmianie sprzedaż z ${formatDisplayDate(oversell.tradedAt)} przekroczyłaby stan posiadania.`;
    }
    if (movedOutBlocker) {
      const from = portfolios.find((item) => item.id === existing?.portfolioId)?.name ?? '';
      return `Bez tej transakcji sprzedaż z ${formatDisplayDate(movedOutBlocker.tradedAt)} w portfelu „${from}” przekroczyłaby stan posiadania.`;
    }
    return null;
  })();

  const canSave =
    portfolioId != null &&
    currency != null &&
    candidate != null &&
    price != null &&
    price > 0 &&
    rate != null &&
    rate > 0 &&
    validationError == null;

  const total =
    quantity != null && price != null && instrumentFee != null
      ? quantity * price + (side === 'buy' ? instrumentFee : -instrumentFee)
      : null;
  const portfolioTotal =
    quantity != null && price != null && rate != null && portfolioFee != null
      ? quantity * price * rate + (side === 'buy' ? portfolioFee : -portfolioFee)
      : null;

  const saleProfit = useMemo(
    () =>
      side === 'sell' && candidate
        ? calculateSaleProfit(otherTrades, {
            quantity: candidate.quantity,
            price: candidate.price,
            fee: candidate.fee,
            tradedAt,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, otherTrades, candidate?.quantity, candidate?.price, candidate?.fee, tradedAt]
  );

  /** The sale result in the portfolio currency, when every purchase has a rate. */
  const baseSaleProfit = useMemo(() => {
    if (
      side !== 'sell' ||
      !candidate ||
      !needsRate ||
      !portfolioCurrency ||
      rate == null ||
      portfolioFee == null
    ) {
      return null;
    }
    const converted: Trade[] = [];
    for (const trade of otherTrades) {
      const tradeFx = tradeRate(trade, portfolioCurrency);
      if (tradeFx == null) return null;
      converted.push(convertTrade(trade, tradeFx, portfolioCurrency));
    }
    return calculateSaleProfit(converted, {
      quantity: candidate.quantity,
      price: candidate.price * rate,
      fee: portfolioFee,
      tradedAt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    side,
    otherTrades,
    candidate?.quantity,
    candidate?.price,
    portfolioFee,
    tradedAt,
    needsRate,
    portfolioCurrency,
    rate,
  ]);

  const shownProfit =
    baseSaleProfit && portfolioCurrency
      ? { ...baseSaleProfit, currency: portfolioCurrency }
      : saleProfit && currency
        ? { ...saleProfit, currency }
        : null;

  // In a cash portfolio a purchase is paid from the cash: warn before it
  // goes negative (it is still allowed: the deposit can be added later).
  const cashPortfolio = portfolios.find((item) => item.id === portfolioId && item.isCash);
  const cashAfter = useMemo(() => {
    if (!cashPortfolio || portfolioTotal == null) return null;
    const before = estimateCashBalance({
      portfolioId: cashPortfolio.id,
      baseCurrency: cashPortfolio.baseCurrency,
      date: tradedAt,
      transactions,
      dividends,
      operations: cashOperations,
      excludeId: existing?.id,
    });
    return before + (side === 'buy' ? -portfolioTotal : portfolioTotal);
  }, [cashPortfolio, portfolioTotal, tradedAt, transactions, dividends, cashOperations, existing?.id, side]);

  const close = () => {
    // Close the whole sheet (the parent stack screen), not just this step.
    navigation.getParent()?.goBack();
  };

  const write = () => {
    if (!canSave || quantity == null || price == null || fee == null) return;
    if (!currency || !portfolioId) return;
    // Saved as entered: quantity and price in the shares of the trade's day,
    // the fee in the currency it was paid in.
    const values = {
      portfolioId,
      quantity,
      price,
      fee,
      feeCurrency,
      currency,
      tradedAt,
      fxRate: needsRate ? rate : null,
      fxCurrency: portfolioCurrency,
    };
    if (existing) {
      updateTransaction(existing.id, values);
    } else {
      saveInstrument({ ...instrument, currency });
      addTransaction({ ...values, symbol: instrument.symbol, side });
    }
    writePreference(LAST_PORTFOLIO_PREFERENCE, portfolioId);
    close();
  };

  const save = () => {
    if (!canSave || quantity == null || price == null || !portfolioId) return;
    // The same operation already saved (e.g. imported from a file)?
    const similar = findSimilarTransaction(
      { portfolioId, symbol: instrument.symbol, side, tradedAt, quantity, price },
      existing?.id
    );
    if (!similar) {
      write();
      return;
    }
    const kind = side === 'buy' ? 'kupno' : 'sprzedaż';
    Alert.alert(
      'Taka operacja już jest',
      `W tym portfelu jest już ${kind} ${formatDecimalInput(quantity)} szt. po ${formatDecimalInput(price)} ${currency ?? ''} z ${formatDisplayDate(tradedAt)}.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: existing ? 'Zapisz mimo to' : 'Dodaj mimo to', onPress: write },
      ]
    );
  };

  const confirmDelete = () => {
    if (!existing) return;
    // Checked in the portfolio the transaction is saved in.
    const blockingSale = findOversell(tradesIn(existing.portfolioId));
    if (blockingSale) {
      Alert.alert(
        'Nie można usunąć',
        `Bez tego zakupu sprzedaż z ${formatDisplayDate(blockingSale.tradedAt)} przekroczyłaby stan posiadania. Najpierw usuń lub zmień tę sprzedaż.`
      );
      return;
    }
    Alert.alert('Usunąć transakcję?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(existing.id);
          close();
        },
      },
    ]);
  };

  const title = side === 'buy' ? 'Kupno' : 'Sprzedaż';
  const currencyLabel = currency ?? '…';
  const splitNote = isUnsplit(ratio)
    ? ''
    : ` Po tej dacie był split ${formatSplitRatio(ratio)}: podaj ilość i cenę z dnia transakcji, aplikacja przeliczy je na dzisiejsze akcje.`;
  const priceFooter =
    (isPriceLoading
      ? 'Pobieranie ceny…'
      : (priceError ??
        (isEditing
          ? 'Cena z zapisanej transakcji.'
          : 'Cena zamknięcia z wybranego dnia. Możesz ją zmienić.'))) + splitNote;

  return (
    <>
      <Stack.Title>{isEditing ? `Edytuj: ${title.toLowerCase()}` : title}</Stack.Title>
      {isSheetRoot ? (
        <>
          <Stack.Screen options={{ headerBackVisible: false }} />
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={close}>
              Anuluj
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel="Zapisz transakcję"
          disabled={!canSave}
          onPress={save}>
          Zapisz
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={styles.host}>
        <FieldGroup modifiers={FORM_MODIFIERS}>
          <FieldGroup.Section title="Instrument">
            <ListItem
              leading={<InstrumentLogo symbol={instrument.symbol} name={instrument.name} size={40} />}
              supportingText={`${instrument.symbol} · ${instrument.exchangeName}`}
              trailing={side === 'sell' ? `${formatDecimalInput(heldOnDate)} szt.` : undefined}>
              {instrument.name}
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Transakcja">
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
            <Row alignment="center" spacing={12}>
              <Text>Ilość</Text>
              <TextInput
                value={quantityState}
                onChangeText={setQuantityText}
                placeholder="0"
                keyboardType="decimal-pad"
                textAlign="right"
                accessibilityLabel="Ilość"
              />
            </Row>
            <Row alignment="center" spacing={12}>
              <Text>{`Cena (${currencyLabel})`}</Text>
              <TextInput
                value={priceState}
                onChangeText={(text) => {
                  isPriceEditedRef.current = true;
                  setPriceText(text);
                }}
                placeholder="0,00"
                keyboardType="decimal-pad"
                textAlign="right"
                accessibilityLabel="Cena za sztukę"
              />
            </Row>
            <Row alignment="center" spacing={12}>
              <Text>{needsRate ? 'Prowizja' : `Prowizja (${currencyLabel})`}</Text>
              <TextInput
                value={feeState}
                onChangeText={setFeeText}
                placeholder="0,00"
                keyboardType="decimal-pad"
                textAlign="right"
                accessibilityLabel={`Prowizja w ${feeCurrency ?? ''}`}
              />
              {needsRate && currency && portfolioCurrency ? (
                <Picker
                  selectedValue={feeInPortfolioCurrency ? 'portfolio' : 'instrument'}
                  onValueChange={(value) => setFeeInPortfolioCurrency(value === 'portfolio')}
                  appearance="menu"
                  accessibilityLabel="Waluta prowizji">
                  <Picker.Item label={portfolioCurrency} value="portfolio" />
                  <Picker.Item label={currency} value="instrument" />
                </Picker>
              ) : null}
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
                  placeholder={isRateLoading ? 'Pobieranie…' : '0,0000'}
                  keyboardType="decimal-pad"
                  textAlign="right"
                  accessibilityLabel={`Kurs wymiany ${currency} na ${portfolioCurrency}`}
                />
              </Row>
            ) : null}
            <DateField label="Data" value={date} maximumDate={new Date()} onChange={setDate} />
            <FieldGroup.SectionFooter>
              {validationError ? (
                <Text textStyle={{ color: ERROR_COLOR }}>{validationError}</Text>
              ) : isRateImplausible && marketRate != null ? (
                <Text textStyle={{ color: ERROR_COLOR }}>
                  {`Kurs różni się o ponad 5% od rynkowego z tego dnia (${formatDecimalInput(marketRate)}), więc w obliczeniach używany jest rynkowy. Popraw go, jeśli to pomyłka.`}
                </Text>
              ) : (
                <Text>
                  {needsRate
                    ? `${priceFooter} ${rateError ?? `Kurs, po którym przeliczono ${currency} na ${portfolioCurrency} — liczy się do kosztu i wyniku.`}`
                    : priceFooter}
                </Text>
              )}
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section title="Podsumowanie">
            <ListItem
              trailing={total != null && currency ? formatMoney(total, currency) : '—'}>
              {side === 'buy' ? 'Kwota zakupu' : 'Kwota sprzedaży'}
            </ListItem>
            {needsRate && portfolioCurrency ? (
              <ListItem
                trailing={
                  portfolioTotal != null ? formatMoney(portfolioTotal, portfolioCurrency) : '—'
                }>
                {`W walucie portfela (${portfolioCurrency})`}
              </ListItem>
            ) : null}
            {side === 'sell' ? (
              <ListItem
                trailing={
                  shownProfit ? (
                    <Text
                      textStyle={{
                        color: shownProfit.amount < 0 ? ERROR_COLOR : PROFIT_COLOR,
                        fontWeight: '600',
                      }}>
                      {formatProfit(shownProfit.amount, shownProfit.ratio, shownProfit.currency)}
                    </Text>
                  ) : (
                    '—'
                  )
                }>
                {shownProfit && shownProfit.amount < 0 ? 'Strata' : 'Zysk'}
              </ListItem>
            ) : null}
            {cashPortfolio && cashAfter != null ? (
              <ListItem
                trailing={
                  <Text textStyle={cashAfter < 0 ? { color: WARNING_COLOR, fontWeight: '600' } : undefined}>
                    {formatMoney(cashAfter, cashPortfolio.baseCurrency)}
                  </Text>
                }>
                Gotówka po operacji
              </ListItem>
            ) : null}
            {cashPortfolio && cashAfter != null && cashAfter < 0 ? (
              <FieldGroup.SectionFooter>
                <Text textStyle={{ color: WARNING_COLOR }}>
                  Za mało gotówki: po zakupie saldo będzie ujemne. Dodaj wpłatę („+” → Wpłata) albo
                  zapisz mimo to i uzupełnij ją później.
                </Text>
              </FieldGroup.SectionFooter>
            ) : side === 'sell' ? (
              <FieldGroup.SectionFooter>
                <Text>
                  {baseSaleProfit
                    ? 'Liczony metodą FIFO (najpierw najstarsze zakupy), z prowizjami i kursami walut transakcji.'
                    : 'Liczony metodą FIFO (najpierw najstarsze zakupy), z prowizjami.'}
                </Text>
              </FieldGroup.SectionFooter>
            ) : null}
          </FieldGroup.Section>

          {isEditing ? (
            <FieldGroup.Section>
              <ListItem onPress={confirmDelete}>
                <Text textStyle={{ color: ERROR_COLOR }}>Usuń transakcję</Text>
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
