import { Host as UIHost, Picker as MenuPicker } from '@expo/ui';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors } from '@/constants/colors';
import {
  GOAL_CURRENCIES,
  GOAL_PERIOD_LABELS,
  MIN_GOAL,
  type GoalPeriod,
} from '@/lib/dividend-goal';
import { formatMoney, parseDecimal } from '@/lib/number';

const PERIODS: GoalPeriod[] = ['month', 'year'];

/** The amount entered, or `null` when it is not a valid goal (below the minimum). */
export function parseGoalAmount(text: string): number | null {
  const value = parseDecimal(text);
  return value != null && value >= MIN_GOAL ? value : null;
}

/**
 * Large centered amount with the currency, and a month / year switch under
 * it: the goal entry of the onboarding and of the goal sheet.
 */
export function GoalEditor({
  amountText,
  onAmountTextChange,
  period,
  onPeriodChange,
  currency,
  onCurrencyChange,
  autoFocus = false,
}: {
  amountText: string;
  onAmountTextChange: (text: string) => void;
  period: GoalPeriod;
  onPeriodChange: (period: GoalPeriod) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  autoFocus?: boolean;
}) {
  const value = parseDecimal(amountText);
  const isTooSmall = amountText.trim() !== '' && (value == null || value < MIN_GOAL);

  return (
    <View style={styles.container}>
      <View style={styles.amountRow}>
        <TextInput
          value={amountText}
          onChangeText={(text) => onAmountTextChange(text.replace(/[^\d.,]/g, ''))}
          placeholder="0"
          placeholderTextColor={Colors.tertiaryLabel}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          accessibilityLabel={`Kwota celu w ${currency}`}
          style={styles.amount}
        />
        {/* The currency is a menu: tap it to change. */}
        <UIHost matchContents>
          <MenuPicker
            selectedValue={currency}
            onValueChange={(value) => onCurrencyChange(String(value))}
            appearance="menu"
            accessibilityLabel="Waluta celu">
            {GOAL_CURRENCIES.map((code) => (
              <MenuPicker.Item key={code} label={code} value={code} />
            ))}
          </MenuPicker>
        </UIHost>
      </View>
      <Text style={[styles.hint, isTooSmall && styles.error]}>
        {isTooSmall
          ? `Minimum ${formatMoney(MIN_GOAL, currency)}`
          : period === 'month'
            ? 'netto, średnio miesięcznie'
            : 'netto, w ciągu roku'}
      </Text>
      <Host matchContents={{ vertical: true }} style={styles.picker}>
        <Picker<GoalPeriod>
          selection={period}
          onSelectionChange={onPeriodChange}
          modifiers={[pickerStyle('segmented')]}>
          {PERIODS.map((item) => (
            <SwiftText key={item} modifiers={[tag(item)]}>
              {GOAL_PERIOD_LABELS[item]}
            </SwiftText>
          ))}
        </Picker>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  amount: {
    width: 220,
    flexShrink: 1,
    fontSize: 56,
    fontWeight: '700',
    color: Colors.label,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 15,
    color: Colors.secondaryLabel,
  },
  error: {
    color: Colors.negative,
  },
  picker: {
    width: 260,
    marginTop: 16,
  },
});
