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
import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';

import { DateField } from '@/components/date-field';
import {
  addCashOperation,
  deleteCashOperation,
  getCashOperation,
  updateCashOperation,
} from '@/db/cash';
import { usePortfolios } from '@/hooks/use-portfolio';
import {
  CASH_OPERATION_LABELS,
  CASH_OPERATION_TYPES,
  signedCashAmount,
  type CashOperationType,
} from '@/lib/cash';
import { fromISODate, toISODate } from '@/lib/date';
import { formatDecimalInput, formatMoney, parseDecimal } from '@/lib/number';

const ERROR_COLOR = '#FF3B30';
const FORM_MODIFIERS =
  Platform.OS === 'ios' ? [scrollDismissesKeyboard('interactively')] : undefined;

type FormParams = { operationId?: string; type?: string; portfolioId?: string };

/** Sheet for a deposit, withdrawal or interest of a cash portfolio. */
export default function CashOperationScreen() {
  const params = useLocalSearchParams<FormParams>();
  const existing = useMemo(
    () => (params.operationId ? getCashOperation(params.operationId) : null),
    [params.operationId]
  );
  const portfolios = usePortfolios().filter((item) => item.isCash);

  const [type, setType] = useState<CashOperationType>(
    existing?.type ??
      ((CASH_OPERATION_TYPES as readonly string[]).includes(params.type ?? '')
        ? (params.type as CashOperationType)
        : 'deposit')
  );
  const [portfolioId, setPortfolioId] = useState<string | null>(
    existing?.portfolioId ??
      (portfolios.some((item) => item.id === params.portfolioId) ? params.portfolioId! : null) ??
      portfolios[0]?.id ??
      null
  );
  const portfolio = portfolios.find((item) => item.id === portfolioId) ?? null;
  const initialAmount = existing ? formatDecimalInput(existing.amount) : '';
  const amountState = useNativeState(initialAmount);
  const [amountText, setAmountText] = useState(initialAmount);
  const noteState = useNativeState(existing?.note ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState(() => (existing ? fromISODate(existing.date) : new Date()));

  const amount = parseDecimal(amountText);
  const error = amountText && (amount == null || amount <= 0) ? 'Podaj poprawną kwotę.' : null;
  const canSave = portfolio != null && amount != null && amount > 0;

  const close = () => router.back();

  const save = () => {
    if (!canSave || !portfolio || amount == null) return;
    const values = {
      portfolioId: portfolio.id,
      type,
      amount,
      date: toISODate(date),
      note: note.trim() || null,
    };
    if (existing) updateCashOperation(existing.id, values);
    else addCashOperation({ ...values, source: 'manual', externalId: null });
    close();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(`Usunąć: ${CASH_OPERATION_LABELS[existing.type].toLowerCase()}?`, 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteCashOperation(existing.id);
          close();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Title>{existing ? CASH_OPERATION_LABELS[type] : 'Gotówka'}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={close}>
          Anuluj
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel="Zapisz"
          disabled={!canSave}
          onPress={save}>
          Zapisz
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={styles.host}>
        <FieldGroup modifiers={FORM_MODIFIERS}>
          <FieldGroup.Section>
            <Row alignment="center" spacing={12}>
              <Text>Rodzaj</Text>
              <Spacer flexible />
              <Picker
                selectedValue={type}
                onValueChange={(value) => setType(value as CashOperationType)}
                appearance="menu"
                accessibilityLabel="Rodzaj operacji">
                {CASH_OPERATION_TYPES.map((item) => (
                  <Picker.Item key={item} label={CASH_OPERATION_LABELS[item]} value={item} />
                ))}
              </Picker>
            </Row>
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
              <Text>{`Kwota (${portfolio?.baseCurrency ?? ''})`}</Text>
              <TextInput
                value={amountState}
                onChangeText={setAmountText}
                placeholder="0,00"
                keyboardType="decimal-pad"
                textAlign="right"
                autoFocus={!existing}
                accessibilityLabel="Kwota"
              />
            </Row>
            <DateField label="Data" value={date} maximumDate={new Date()} onChange={setDate} />
            <Row alignment="center" spacing={12}>
              <Text>Notatka</Text>
              <TextInput
                value={noteState}
                onChangeText={setNote}
                placeholder="opcjonalnie"
                textAlign="right"
                accessibilityLabel="Notatka"
              />
            </Row>
            <FieldGroup.SectionFooter>
              {error ? (
                <Text textStyle={{ color: ERROR_COLOR }}>{error}</Text>
              ) : portfolios.length === 0 ? (
                <Text>
                  Nie masz portfela gotówkowego. Opcję „Portfel gotówkowy” wybierasz przy tworzeniu
                  portfela.
                </Text>
              ) : (
                <Text>
                  {type === 'deposit' || type === 'withdrawal'
                    ? 'Wpłaty i wypłaty to Twój kapitał: wynik portfela liczy się od nich.'
                    : 'Odsetki od wolnych środków zwiększają saldo i wynik, a podatek od nich je zmniejsza.'}
                </Text>
              )}
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          {amount != null && amount > 0 && portfolio ? (
            <FieldGroup.Section>
              <ListItem
                trailing={formatMoney(signedCashAmount({ type, amount }), portfolio.baseCurrency)}>
                Zmiana salda
              </ListItem>
            </FieldGroup.Section>
          ) : null}

          {existing ? (
            <FieldGroup.Section>
              <ListItem onPress={confirmDelete}>
                <Text textStyle={{ color: ERROR_COLOR }}>Usuń operację</Text>
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
