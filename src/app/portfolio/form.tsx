import {
  FieldGroup,
  Host,
  ListItem,
  Picker,
  RNHostView,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ColorSwatches } from '@/components/color-swatches';
import { IconPicker } from '@/components/icon-picker';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  createPortfolio,
  DEFAULT_PORTFOLIO_COLOR,
  DEFAULT_PORTFOLIO_ICON,
  getPortfolio,
  PORTFOLIO_COLORS,
  PORTFOLIO_ICONS,
  PORTFOLIO_CURRENCIES,
  updatePortfolio,
  type AccountType,
  type PortfolioIcon,
} from '@/db/portfolios';
import { confirmDeletePortfolio } from '@/lib/portfolio-actions';

const ERROR_COLOR = '#FF3B30';
const MAX_NAME_LENGTH = 40;

/** Sheet for adding a portfolio, or editing / deleting one (`portfolioId`). */
export default function PortfolioFormScreen() {
  const { portfolioId } = useLocalSearchParams<{ portfolioId?: string }>();
  const existing = useMemo(() => (portfolioId ? getPortfolio(portfolioId) : null), [portfolioId]);

  const nameState = useNativeState(existing?.name ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [currency, setCurrency] = useState<string>(existing?.baseCurrency ?? 'PLN');
  // Nothing chosen means a regular account.
  const [accountType, setAccountType] = useState<AccountType>(existing?.accountType ?? 'standard');
  const [color, setColor] = useState<string>(existing?.color ?? DEFAULT_PORTFOLIO_COLOR);
  const [icon, setIcon] = useState<PortfolioIcon>(existing?.icon ?? DEFAULT_PORTFOLIO_ICON);
  const canSave = name.trim().length > 0;

  const close = () => router.back();

  const save = () => {
    if (!canSave) return;
    const input = { name, baseCurrency: currency, accountType, color, icon };
    if (existing) updatePortfolio(existing.id, input);
    else createPortfolio(input);
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
            <Row spacing={12}>
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
            <Row spacing={12}>
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
            <Row spacing={12}>
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

          <FieldGroup.Section title="Kolor portfela">
            <RNHostView matchContents>
              <ColorSwatches colors={PORTFOLIO_COLORS} value={color} onChange={setColor} />
            </RNHostView>
          </FieldGroup.Section>

          <FieldGroup.Section title="Ikona portfela">
            <RNHostView matchContents>
              <IconPicker icons={PORTFOLIO_ICONS} value={icon} color={color} onChange={setIcon} />
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
});
