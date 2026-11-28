import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { GoalEditor, parseGoalAmount } from '@/components/goal-editor';
import { Colors } from '@/constants/colors';
import { getDividendGoal, setDividendGoal, type GoalPeriod } from '@/lib/dividend-goal';
import { track } from '@/lib/analytics';
import { setDividendNotifications } from '@/lib/notifications';
import { formatDecimalInput } from '@/lib/number';
import { useSummaryCurrency } from '@/lib/settings';

/** Sheet to set, change (or set the next) and remove the dividend goal. */
export default function GoalSheet() {
  const existing = getDividendGoal();
  const currency = useSummaryCurrency();
  const [amountText, setAmountText] = useState(existing ? formatDecimalInput(existing.amount) : '');
  const [period, setPeriod] = useState<GoalPeriod>(existing?.period ?? 'month');
  const [goalCurrency, setGoalCurrency] = useState(existing?.currency ?? currency);
  const amount = parseGoalAmount(amountText);
  // The toolbar may keep the first callback: it reads the latest entry from here.
  const latest = useRef({ amount, period, goalCurrency });
  latest.current = { amount, period, goalCurrency };
  const close = () => router.back();

  const save = () => {
    const { amount: value, period: chosen, goalCurrency: code } = latest.current;
    if (value == null) return;
    try {
      setDividendGoal({ amount: value, period: chosen, currency: code });
      track({ name: 'dividend_goal_set', params: { period: chosen } });
    } catch (error) {
      Alert.alert(
        'Nie udało się zapisać celu',
        error instanceof Error ? error.message : 'Spróbuj ponownie.'
      );
      return;
    }
    close();
    // A goal is worth a notification when it is reached (asks the system once).
    setDividendNotifications(true);
  };

  const confirmDelete = () =>
    Alert.alert('Usunąć cel dywidendowy?', undefined, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          setDividendGoal(null);
          close();
        },
      },
    ]);

  return (
    <>
      <Stack.Title>Cel dywidendowy</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Anuluj" onPress={close}>
          Anuluj
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          variant="prominent"
          accessibilityLabel="Zapisz cel"
          disabled={amount == null}
          onPress={save}>
          Zapisz
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        <Text style={styles.body}>
          Śledź swoje dywidendy w Stilo i zobacz, jak blisko FIRE już jesteś.
        </Text>
        <GoalEditor
          amountText={amountText}
          onAmountTextChange={setAmountText}
          period={period}
          onPeriodChange={setPeriod}
          currency={goalCurrency}
          onCurrencyChange={setGoalCurrency}
          autoFocus
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: amount == null }}
          disabled={amount == null}
          onPress={save}
          style={({ pressed }) => [
            styles.primary,
            amount == null && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.primaryText}>{existing ? 'Zapisz cel' : 'Ustaw cel'}</Text>
        </Pressable>
        {existing ? (
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
            <Text style={styles.deleteText}>Usuń cel</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 28,
  },
  body: {
    fontSize: 17,
    lineHeight: 23,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
  primary: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.4,
  },
  delete: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  deleteText: {
    fontSize: 17,
    color: Colors.negative,
  },
  pressed: {
    opacity: 0.5,
  },
});
