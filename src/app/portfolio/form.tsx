import {
  FieldGroup,
  Host,
  ListItem,
  Picker,
  RNHostView,
  Row,
  Spacer,
  Switch,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, Text as RNText, StyleSheet } from 'react-native';

import { IconPicker } from '@/components/icon-picker';
import { Colors } from '@/constants/colors';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  createPortfolio,
  DEFAULT_PORTFOLIO_ICON,
  getPortfolio,
  PORTFOLIO_ICONS,
  PORTFOLIO_CURRENCIES,
  updatePortfolio,
  type AccountType,
  type PortfolioIcon,
} from '@/db/portfolios';
import { track } from '@/lib/analytics';
import { confirmDeletePortfolio } from '@/lib/portfolio-actions';

const ERROR_COLOR = '#FF3B30';

const MAX_NAME_LENGTH = 40;

const CASH_INFO =
  'Portfel gotówkowy śledzi gotówkę na koncie. Będziesz musiał dodawać wpłaty oraz wypłaty, a operacje będą zmieniać saldo dostępnej gotówki (zakupy je zmniejszają, sprzedaże i dywidendy zwiększają). Wartość portfela będzie liczona jako pozycje plus aktualna gotówka.';
const DIVIDENDS_INFO =
  'Włącz (domyślnie), jeśli chcesz, żeby otrzymane dywidendy liczyły się w wynikach pojedynczych pozycji w portfelu.\n\nWyłącz, jeśli chcesz, żeby w wynikach pozycji pokazywał się sam zysk z ceny i/lub kursu waluty (tak jak u Twojego brokera lub w domu maklerskim).';

/**
 * Name of an option with ⓘ: tapping the text or the icon shows the
 * explanation, with a highlighted button.
 */
function InfoLabel({ label, title, message }: { label: string; title: string; message: string }) {
  return (
    <RNHostView matchContents>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Pokazuje wyjaśnienie"
        hitSlop={8}
        onPress={() =>
          Alert.alert(title, message, [{ text: 'Rozumiem', style: 'default', isPreferred: true }])
        }
        style={({ pressed }) => [styles.infoLabel, pressed && styles.pressed]}>
        <RNText style={styles.infoText}>{label}</RNText>
        <SymbolView name="info.circle" tintColor={Colors.tint} size={18} />
      </Pressable>
    </RNHostView>
  );
}

/** Sheet for adding a portfolio, or editing / deleting one (`portfolioId`). */
export default function PortfolioFormScreen() {
  const { portfolioId } = useLocalSearchParams<{ portfolioId?: string }>();
  const existing = useMemo(() => (portfolioId ? getPortfolio(portfolioId) : null), [portfolioId]);

  const nameState = useNativeState(existing?.name ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [currency, setCurrency] = useState<string>(existing?.baseCurrency ?? 'PLN');
  // Nothing chosen means a regular account.
  const [accountType, setAccountType] = useState<AccountType>(existing?.accountType ?? 'standard');
  const [icon, setIcon] = useState<PortfolioIcon>(existing?.icon ?? DEFAULT_PORTFOLIO_ICON);
  // Only when creating: switching later would change the whole history.
  const [isCash, setIsCash] = useState(existing?.isCash ?? false);
  // On by default for new portfolios.
  const [includeDividends, setIncludeDividends] = useState(existing?.includeDividends ?? true);
  const canSave = name.trim().length > 0;

  const close = () => router.back();

  const save = () => {
    if (!canSave) return;
    const input = { name, baseCurrency: currency, accountType, icon, includeDividends };
    if (existing) updatePortfolio(existing.id, input);
    else {
      createPortfolio({ ...input, isCash });
      track({ name: 'portfolio_create', params: { account_type: accountType, is_cash: isCash } });
    }
    close();
  };

  const confirmDelete = () => {
    if (existing) confirmDeletePortfolio(existing, close);
  };

  return (
    <>
      <Stack.Title>{existing ? 'Edytuj portfel' : 'Nowy portfel'}</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={close}>
          Anuluj
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel="Zapisz portfel"
          disabled={!canSave}
          onPress={save}>
          Zapisz
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={styles.host}>
        <FieldGroup>
          <FieldGroup.Section title="Portfel">
            <Row alignment="center" spacing={12}>
              <Text>Nazwa</Text>
              <TextInput
                value={nameState}
                onChangeText={setName}
                placeholder="np. IKE, Konto maklerskie"
                autoFocus={!existing}
                maxLength={MAX_NAME_LENGTH}
                textAlign="right"
                accessibilityLabel="Nazwa portfela"
              />
            </Row>
            <Row alignment="center" spacing={12}>
              <Text>Typ konta</Text>
              <Spacer flexible />
              <Picker
                selectedValue={accountType}
                onValueChange={setAccountType}
                appearance="menu"
                accessibilityLabel="Typ konta">
                {ACCOUNT_TYPES.map((type) => (
                  <Picker.Item key={type} label={ACCOUNT_TYPE_LABELS[type]} value={type} />
                ))}
              </Picker>
            </Row>
            <Row alignment="center" spacing={12}>
              <Text>Waluta</Text>
              <Spacer flexible />
              <Picker
                selectedValue={currency}
                onValueChange={setCurrency}
                appearance="menu"
                accessibilityLabel="Waluta portfela">
                {PORTFOLIO_CURRENCIES.map((code) => (
                  <Picker.Item key={code} label={code} value={code} />
                ))}
              </Picker>
            </Row>
          </FieldGroup.Section>

          <FieldGroup.Section title="Opcje">
            <Row alignment="center" spacing={8}>
              <InfoLabel
                label="Portfel gotówkowy"
                title="Portfel gotówkowy"
                message={
                  existing
                    ? `Portfel gotówkowy można włączyć tylko przy tworzeniu portfela.\n\n${CASH_INFO}`
                    : CASH_INFO
                }
              />
              <Spacer flexible />
              <Switch value={isCash} onValueChange={setIsCash} disabled={existing != null} />
            </Row>
            <Row alignment="center" spacing={8}>
              <InfoLabel
                label="Dywidendy w wynikach pozycji"
                title="Dywidendy w wynikach pozycji"
                message={DIVIDENDS_INFO}
              />
              <Spacer flexible />
              <Switch value={includeDividends} onValueChange={setIncludeDividends} />
            </Row>
            {isCash && !existing ? (
              <FieldGroup.SectionFooter>
                <Text>
                  W tym portfelu wpisuj wpłaty i wypłaty (menu „+” w portfelu). Bez wpłat saldo
                  gotówki po zakupach będzie ujemne.
                </Text>
              </FieldGroup.SectionFooter>
            ) : null}
          </FieldGroup.Section>

          <FieldGroup.Section title="Ikona portfela">
            <RNHostView matchContents>
              <IconPicker icons={PORTFOLIO_ICONS} value={icon} onChange={setIcon} />
            </RNHostView>
          </FieldGroup.Section>

          {existing ? (
            <FieldGroup.Section>
              <ListItem onPress={confirmDelete}>
                <Text textStyle={{ color: ERROR_COLOR }}>Usuń portfel</Text>
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
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: {
    opacity: 0.5,
  },
  infoText: {
    fontSize: 17,
    color: Colors.label,
  },
});
